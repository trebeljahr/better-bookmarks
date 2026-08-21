/**
 * Auto-backup subsystem — public API.
 */

export {
  BACKUP_FILENAME_PREFIX,
  BACKUP_FILENAME_REGEX,
  type BackupResult,
  backupFileNameFor,
  cleanupOldBackups,
  runBackupOnce,
} from "./autoBackup";
export {
  CHROME_TREE_BACKUP_PREFIX,
  CHROME_TREE_BACKUP_REGEX,
  type ChromeTreeBackupResult,
  chromeTreeBackupFileNameFor,
  cleanupOldChromeTreeBackups,
  runChromeTreeBackupOnce,
} from "./chromeTreeBackup";
export { BACKUP_ALARM_NAME, installBackupAlarm } from "./scheduleAlarm";
