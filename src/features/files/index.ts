export { createFilesRepository, type FileRow } from "./server/files.repository";
export {
  ATTACHMENT_OWNER_TYPES,
  createAttachmentsRepository,
  type AttachmentOwner,
  type AttachmentOwnerType,
  type AttachmentView,
} from "./server/attachments.repository";
export { getFileDeps, getUploadDeps } from "./server/deps";
export {
  getFileForUser,
  getStorageUsage,
  type FileDeps,
  type StorageUsage,
} from "./server/service";
export { UploadRejected, withUpload, type UploadDeps } from "./server/uploads";
export { purgeFiles, type PurgeOptions, type PurgeReport } from "./server/purge";
export {
  addAttachment,
  GENERIC_OWNER_TYPES,
  listAttachments,
  MAX_ATTACHMENTS_PER_OWNER,
  removeAttachment,
} from "./server/attachments.service";
export { removeAttachmentAction, type RemoveAttachmentResult } from "./server/attachment-actions";
export { AttachmentManager, type AttachmentItem } from "./components/attachment-manager";
