export { getMedicalDeps } from "./server/deps";
export {
  createMedicalRecord,
  deleteMedicalRecord,
  getAllergySummaries,
  getMedicalRecord,
  restoreMedicalRecord,
  updateMedicalRecord,
  type AllergySummary,
  type MedicalDeps,
  type MedicalRecordDetail,
} from "./server/service";
export { createMedicalRepository, type MedicalRecordRow } from "./server/medical.repository";
export {
  asRecordType,
  asSeverity,
  EMPTY_MEDICAL_RECORD_INPUT,
  MEDICAL_RECORD_TYPES,
  medicalRecordInputSchema,
  RECORD_FIELDS,
  SEVERITIES,
  type MedicalRecordInput,
  type MedicalRecordType,
  type Severity,
} from "./schemas";
export {
  createMedicalRecordAction,
  deleteMedicalRecordAction,
  restoreMedicalRecordAction,
  updateMedicalRecordAction,
} from "./server/actions";
