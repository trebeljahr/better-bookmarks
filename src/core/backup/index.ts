/**
 * Auto-backup subsystem — public API.
 */

export {
  BACKUP_FILENAME_PREFIX,
  BACKUP_FILENAME_REGEX,
  BACKUP_PAYLOAD_VERSION,
  type BackupPayload,
  type BackupResult,
  backupFileNameFor,
  cleanupOldBackups,
  collectBackupPayload,
  runBackupOnce,
} from "./autoBackup";
export { BACKUP_ALARM_NAME, installBackupAlarm } from "./scheduleAlarm";
