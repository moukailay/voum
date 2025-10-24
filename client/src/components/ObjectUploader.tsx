import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  uploadType?: "image" | "document";
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  buttonClassName?: string;
  buttonVariant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  children: ReactNode;
}

/**
 * A file upload component that renders as a button and provides a modal interface for
 * file management.
 * 
 * Features:
 * - Renders as a customizable button that opens a file upload modal
 * - Provides a modal interface for:
 *   - File selection
 *   - File preview
 *   - Upload progress tracking
 *   - Upload status display
 * 
 * The component uses Uppy under the hood to handle all file upload functionality.
 * All file management features are automatically handled by the Uppy dashboard modal.
 * 
 * @param props - Component props
 * @param props.maxNumberOfFiles - Maximum number of files allowed to be uploaded
 *   (default: 1)
 * @param props.maxFileSize - Maximum file size in bytes (default: 3MB for images, 5MB for documents)
 * @param props.allowedFileTypes - Array of allowed MIME types (overrides uploadType defaults)
 * @param props.uploadType - Type of upload: "image" (JPG/PNG, 3MB) or "document" (PDF, 5MB)
 * @param props.onGetUploadParameters - Function to get upload parameters (method and URL).
 *   Typically used to fetch a presigned URL from the backend server for direct-to-S3
 *   uploads.
 * @param props.onComplete - Callback function called when upload is complete. Typically
 *   used to make post-upload API calls to update server state and set object ACL
 *   policies.
 * @param props.buttonClassName - Optional CSS class name for the button
 * @param props.buttonVariant - Button variant (default: "outline")
 * @param props.children - Content to be rendered inside the button
 */
export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize,
  allowedFileTypes,
  uploadType = "image",
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  buttonVariant = "outline",
  children,
}: ObjectUploaderProps) {
  // Set defaults based on upload type
  const defaultMaxFileSize = uploadType === "image" ? 3145728 : 5242880; // 3MB for images, 5MB for documents
  const defaultAllowedTypes = uploadType === "image" 
    ? ["image/jpeg", "image/jpg", "image/png"]
    : ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
  
  const finalMaxFileSize = maxFileSize ?? defaultMaxFileSize;
  const finalAllowedTypes = allowedFileTypes ?? defaultAllowedTypes;
  const [showModal, setShowModal] = useState(false);
  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize: finalMaxFileSize,
        allowedFileTypes: finalAllowedTypes,
      },
      autoProceed: false,
    })
      .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: onGetUploadParameters,
      })
      .on("complete", (result) => {
        onComplete?.(result);
        setShowModal(false);
      })
  );

  // Update Uppy restrictions when props change
  useEffect(() => {
    uppy.setOptions({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize: finalMaxFileSize,
        allowedFileTypes: finalAllowedTypes,
      },
    });
  }, [uppy, maxNumberOfFiles, finalMaxFileSize, finalAllowedTypes]);

  return (
    <div>
      <Button 
        onClick={() => setShowModal(true)} 
        className={buttonClassName}
        variant={buttonVariant}
        type="button"
        data-testid="button-upload-file"
      >
        {children}
      </Button>

      <DashboardModal
        uppy={uppy}
        open={showModal}
        onRequestClose={() => setShowModal(false)}
        proudlyDisplayPoweredByUppy={false}
      />
    </div>
  );
}
