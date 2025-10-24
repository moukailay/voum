import { File } from "@google-cloud/storage";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

// The type of the access group.
//
// Can be flexibly defined according to the use case.
//
// For ParcelLink, we support:
// - CONVERSATION_PARTICIPANT: users who are part of a specific booking conversation
export enum ObjectAccessGroupType {
  CONVERSATION_PARTICIPANT = "conversation_participant",
}

// The logic user group that can access the object.
export interface ObjectAccessGroup {
  // The type of the access group.
  type: ObjectAccessGroupType;
  // The logic id that is enough to identify the qualified group members.
  //
  // For CONVERSATION_PARTICIPANT: the booking ID
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

// The ACL policy of the object.
// This would be set as part of the object custom metadata:
// - key: "custom:aclPolicy"
// - value: JSON string of the ObjectAclPolicy object.
export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

// Check if the requested permission is allowed based on the granted permission.
function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  // Users granted with read or write permissions can read the object.
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }

  // Only users granted with write permissions can write the object.
  return granted === ObjectPermission.WRITE;
}

// The base class for all access groups.
//
// Different types of access groups can be implemented according to the use case.
abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  // Check if the user is a member of the group.
  public abstract hasMember(userId: string): Promise<boolean>;
}

// Access group for conversation participants (sender and traveler in a booking)
class ConversationParticipantAccessGroup extends BaseObjectAccessGroup {
  constructor(bookingId: string) {
    super(ObjectAccessGroupType.CONVERSATION_PARTICIPANT, bookingId);
  }

  async hasMember(userId: string): Promise<boolean> {
    // In real implementation, would query the database to check if userId
    // is either the sender or the traveler of the booking
    // For now, we'll use a simple import to avoid circular dependencies
    const { storage } = await import("./storage");
    try {
      const booking = await storage.getBooking(this.id);
      if (!booking) return false;
      
      // Check if user is sender or if they're the traveler
      if (booking.senderId === userId) return true;
      
      // Get the trip to check if user is the traveler
      const trip = await storage.getTrip(booking.tripId);
      return trip?.travelerId === userId;
    } catch (error) {
      console.error("Error checking conversation participant:", error);
      return false;
    }
  }
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    case ObjectAccessGroupType.CONVERSATION_PARTICIPANT:
      return new ConversationParticipantAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

// Sets the ACL policy to the object metadata.
export async function setObjectAclPolicy(
  objectFile: File,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new Error(`Object not found: ${objectFile.name}`);
  }

  await objectFile.setMetadata({
    metadata: {
      [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy),
    },
  });
}

// Gets the ACL policy from the object metadata.
export async function getObjectAclPolicy(
  objectFile: File,
): Promise<ObjectAclPolicy | null> {
  const [metadata] = await objectFile.getMetadata();
  const aclPolicy = metadata?.metadata?.[ACL_POLICY_METADATA_KEY];
  if (!aclPolicy) {
    return null;
  }
  return JSON.parse(aclPolicy as string);
}

// Checks if the user can access the object.
export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: File;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  // When this function is called, the acl policy is required.
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) {
    return false;
  }

  // Public objects are always accessible for read.
  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  // Access control requires the user id.
  if (!userId) {
    return false;
  }

  // The owner of the object can always access it.
  if (aclPolicy.owner === userId) {
    return true;
  }

  // Go through the ACL rules to check if the user has the required permission.
  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}
