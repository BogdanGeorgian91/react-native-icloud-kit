import { Platform } from 'react-native';
import { requireNativeModule } from 'expo';

// ─── Types ──────────────────────────────────────────────────────────

export type FieldValue = string | number | null;
export type Fields = Record<string, FieldValue>;

export interface CloudKitRecord {
  recordId: string;
  fields: Fields;
}

export interface BatchRecord {
  fields: Fields;
  recordId?: string;
}

export interface ICloudAPI {
  /**
   * Check if iCloud is available (user is signed in).
   * Returns `false` on Android.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Fetch the current user's CloudKit record ID (recordName).
   * Useful for support/debug: identifies which iCloud account owns the data.
   * Throws if iCloud is not available.
   */
  getUserRecordID(): Promise<string>;

  /**
   * Save a single CKRecord to CloudKit private database.
   * Creates a new record or overwrites an existing one if `recordId` matches.
   *
   * @param recordType - CloudKit record type name (e.g., "GameSession")
   * @param fields - Key-value pairs for the record fields
   * @param recordId - Optional deterministic ID; auto-generated UUID if omitted
   * @returns The saved record's ID (recordName)
   */
  save(recordType: string, fields: Fields, recordId?: string): Promise<string>;

  /**
   * Query records by type from CloudKit private database.
   * Supports NSPredicate-format filtering and automatic cursor pagination.
   *
   * @param recordType - CloudKit record type name
   * @param predicate - Optional NSPredicate format string (e.g., "nValue >= 3"). Defaults to all records.
   * @param limit - Optional max records to return. Defaults to all (auto-paginates).
   * @returns Array of records with their IDs and field values
   */
  query(
    recordType: string,
    predicate?: string,
    limit?: number
  ): Promise<CloudKitRecord[]>;

  /**
   * Batch save multiple records to CloudKit private database.
   * Automatically chunks into batches of 400 and handles `limitExceeded`
   * errors by halving batch size and retrying.
   *
   * @param recordType - CloudKit record type name
   * @param records - Array of records, each with fields and optional deterministic recordId
   * @returns Count of successfully saved records
   */
  batchSave(recordType: string, records: BatchRecord[]): Promise<number>;

  /**
   * Delete a single CKRecord from CloudKit private database.
   *
   * @param recordType - CloudKit record type name (used for context; deletion is by ID)
   * @param recordId - The record ID to delete
   * @returns `true` on success
   */
  delete(recordType: string, recordId: string): Promise<boolean>;
}

export interface ICloudKVSAPI {
  /**
   * Write a string value to NSUbiquitousKeyValueStore.
   * Use JSON.stringify() for complex values.
   */
  set(key: string, value: string): Promise<void>;

  /**
   * Read a string value from NSUbiquitousKeyValueStore.
   * Returns `null` if the key doesn't exist.
   */
  get(key: string): Promise<string | null>;
}

// ─── Native Module Loading ─────────────────────────────────────────

const IS_IOS = Platform.OS === 'ios';

const NativeICloudKit = IS_IOS ? requireNativeModule('ICloudKit') : null;
const NativeICloudKVS = IS_IOS ? requireNativeModule('ICloudKVS') : null;

// ─── Public API ─────────────────────────────────────────────────────

export const iCloud: ICloudAPI = {
  async isAvailable(): Promise<boolean> {
    if (!IS_IOS) return false;
    return NativeICloudKit!.isAvailable();
  },

  async getUserRecordID(): Promise<string> {
    if (!IS_IOS) throw new Error('iCloud is only available on iOS');
    return NativeICloudKit!.getUserRecordID();
  },

  async save(
    recordType: string,
    fields: Fields,
    recordId?: string
  ): Promise<string> {
    if (!IS_IOS) throw new Error('iCloud is only available on iOS');
    return NativeICloudKit!.save(recordType, fields, recordId ?? null);
  },

  async query(
    recordType: string,
    predicate?: string,
    limit?: number
  ): Promise<CloudKitRecord[]> {
    if (!IS_IOS) throw new Error('iCloud is only available on iOS');
    return NativeICloudKit!.query(
      recordType,
      predicate ?? null,
      limit ?? null
    );
  },

  async batchSave(
    recordType: string,
    records: BatchRecord[]
  ): Promise<number> {
    if (!IS_IOS) throw new Error('iCloud is only available on iOS');
    return NativeICloudKit!.batchSave(recordType, records);
  },

  async delete(recordType: string, recordId: string): Promise<boolean> {
    if (!IS_IOS) throw new Error('iCloud is only available on iOS');
    return NativeICloudKit!.delete(recordType, recordId);
  },
};

export const iCloudKVS: ICloudKVSAPI = {
  async set(key: string, value: string): Promise<void> {
    if (!IS_IOS) throw new Error('iCloud KVS is only available on iOS');
    return NativeICloudKVS!.set(key, value);
  },

  async get(key: string): Promise<string | null> {
    if (!IS_IOS) return null;
    return NativeICloudKVS!.get(key);
  },
};
