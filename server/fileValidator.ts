import { ObjectStorageService } from "./objectStorage";

// File signatures (magic bytes) for allowed file types
// Using prefix matching to handle variations (like different JPEG EXIF headers)
const FILE_SIGNATURES: Record<string, { prefix: number[]; minLength: number }> = {
  "image/jpeg": { prefix: [0xff, 0xd8, 0xff], minLength: 3 }, // All JPEG files start with FFD8FF
  "image/png": { prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], minLength: 8 },
  "application/pdf": { prefix: [0x25, 0x50, 0x44, 0x46], minLength: 4 }, // %PDF
};

// Known malicious patterns in file content (basic checks)
const MALICIOUS_PATTERNS = [
  { pattern: /<%\s*eval/i, description: "PHP eval injection" },
  { pattern: /<script[\s>]/i, description: "Embedded script tag" },
  { pattern: /javascript:/i, description: "JavaScript protocol" },
  { pattern: /on(load|error|click)\s*=/i, description: "Event handler injection" },
];

/**
 * Validates file type by checking magic bytes (file signature).
 * This helps detect file type mismatches which can indicate malicious files.
 */
async function validateFileSignature(
  fileUrl: string,
  declaredMimeType: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    // Get the file from object storage
    const objectStorageService = new ObjectStorageService();
    const objectFile = await objectStorageService.getObjectEntityFile(fileUrl);

    // Get expected signature for this MIME type
    const expectedSignature = FILE_SIGNATURES[declaredMimeType];
    if (!expectedSignature) {
      return { valid: false, reason: "Unsupported file type" };
    }

    // Read enough bytes to check signature
    const bytesToRead = Math.max(expectedSignature.minLength, 16);
    const stream = objectFile.createReadStream({ start: 0, end: bytesToRead - 1 });
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    
    // Check if file is too small
    if (buffer.length < expectedSignature.minLength) {
      return { valid: false, reason: "File too small or corrupted" };
    }

    const bytes = Array.from(buffer);

    // Check if file matches the expected signature prefix
    const signatureMatches = expectedSignature.prefix.every(
      (byte, index) => bytes[index] === byte
    );

    if (!signatureMatches) {
      return { 
        valid: false, 
        reason: "File signature does not match declared type" 
      };
    }

    return { valid: true };
  } catch (error) {
    console.error("Error validating file signature:", error);
    return { 
      valid: false, 
      reason: "Failed to validate file signature" 
    };
  }
}

/**
 * Scans file content for known malicious patterns.
 * This is a basic content analysis step in lieu of full antivirus.
 */
async function scanFileContent(
  fileUrl: string
): Promise<{ safe: boolean; threats?: string[] }> {
  try {
    const objectStorageService = new ObjectStorageService();
    const objectFile = await objectStorageService.getObjectEntityFile(fileUrl);

    // Read first 1KB of file content for pattern matching
    const stream = objectFile.createReadStream({ start: 0, end: 1023 });
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const content = buffer.toString("utf8", 0, Math.min(buffer.length, 1024));

    // Check for malicious patterns
    const foundThreats: string[] = [];
    for (const { pattern, description } of MALICIOUS_PATTERNS) {
      if (pattern.test(content)) {
        foundThreats.push(description);
      }
    }

    return {
      safe: foundThreats.length === 0,
      threats: foundThreats.length > 0 ? foundThreats : undefined,
    };
  } catch (error) {
    console.error("Error scanning file content:", error);
    // If we can't scan, reject for safety
    return { safe: false, threats: ["Failed to scan file content"] };
  }
}

/**
 * Performs comprehensive file validation and antivirus scanning including:
 * - MIME type validation
 * - File size limits
 * - File name malware checks
 * - File signature validation (magic bytes)
 * - Content pattern scanning for malicious code
 * 
 * This function acts as the antivirus scanning step, performing multiple
 * security checks before allowing file persistence.
 */
export async function validateUploadedFile(params: {
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}): Promise<{ 
  valid: boolean; 
  error?: string;
  scanResult?: {
    signatureCheck: boolean;
    contentScan: boolean;
    threats?: string[];
  }
}> {
  const { fileUrl, fileName, fileType, fileSize } = params;

  // 1. Validate file type (only allow PDF, JPG, PNG)
  const allowedMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
  ];

  const normalizedMimeType = fileType.toLowerCase();
  if (!allowedMimeTypes.includes(normalizedMimeType)) {
    return {
      valid: false,
      error: "Invalid file type. Only PDF, JPG, and PNG files are allowed.",
    };
  }

  // 2. Validate file size (3MB for images, 5MB for documents)
  const maxImageSize = 3 * 1024 * 1024; // 3MB
  const maxDocumentSize = 5 * 1024 * 1024; // 5MB
  const isImage = normalizedMimeType.startsWith("image/");
  const maxSize = isImage ? maxImageSize : maxDocumentSize;

  if (fileSize > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${isImage ? "3MB" : "5MB"} for ${isImage ? "images" : "documents"}.`,
    };
  }

  // 3. Basic malware check - file name validation
  const suspiciousPatterns = [
    /\.(exe|bat|cmd|com|scr|vbs|js|jar|app|dmg)$/i,
    /[<>:"|?*]/,
    /\.\./,
  ];

  if (suspiciousPatterns.some((pattern) => pattern.test(fileName))) {
    return {
      valid: false,
      error: "Invalid file name. File appears to be suspicious.",
    };
  }

  // Convert image/jpg to image/jpeg for signature lookup
  const signatureMimeType = normalizedMimeType === "image/jpg" ? "image/jpeg" : normalizedMimeType;
  
  // 4. ANTIVIRUS STEP 1: File signature validation (magic bytes check)
  // This detects file type mismatches which can indicate malicious files
  const signatureValidation = await validateFileSignature(fileUrl, signatureMimeType);
  if (!signatureValidation.valid) {
    return {
      valid: false,
      error: `File rejected by antivirus scan: ${signatureValidation.reason}`,
      scanResult: {
        signatureCheck: false,
        contentScan: false,
      },
    };
  }

  // 5. ANTIVIRUS STEP 2: Content pattern scanning
  // Scans file content for known malicious patterns
  const contentScan = await scanFileContent(fileUrl);
  if (!contentScan.safe) {
    return {
      valid: false,
      error: `File rejected by antivirus scan: potential threats detected`,
      scanResult: {
        signatureCheck: true,
        contentScan: false,
        threats: contentScan.threats,
      },
    };
  }

  // All antivirus checks passed
  return { 
    valid: true,
    scanResult: {
      signatureCheck: true,
      contentScan: true,
    },
  };
}

/**
 * Validates file metadata before upload (client-side checks)
 */
export function validateFileMetadata(params: {
  fileName: string;
  fileType: string;
  fileSize: number;
}): { valid: boolean; error?: string } {
  const { fileName, fileType, fileSize } = params;

  // 1. Validate file type
  const allowedMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
  ];

  const normalizedMimeType = fileType.toLowerCase();
  if (!allowedMimeTypes.includes(normalizedMimeType)) {
    return {
      valid: false,
      error: "Invalid file type. Only PDF, JPG, and PNG files are allowed.",
    };
  }

  // 2. Validate file size
  const maxImageSize = 3 * 1024 * 1024; // 3MB
  const maxDocumentSize = 5 * 1024 * 1024; // 5MB
  const isImage = normalizedMimeType.startsWith("image/");
  const maxSize = isImage ? maxImageSize : maxDocumentSize;

  if (fileSize > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${isImage ? "3MB" : "5MB"} for ${isImage ? "images" : "documents"}.`,
    };
  }

  // 3. File name validation
  const suspiciousPatterns = [
    /\.(exe|bat|cmd|com|scr|vbs|js|jar|app|dmg)$/i,
    /[<>:"|?*]/,
    /\.\./,
  ];

  if (suspiciousPatterns.some((pattern) => pattern.test(fileName))) {
    return {
      valid: false,
      error: "Invalid file name. File appears to be suspicious.",
    };
  }

  return { valid: true };
}
