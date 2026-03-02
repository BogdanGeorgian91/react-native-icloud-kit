# react-native-icloud-kit

CloudKit and NSUbiquitousKeyValueStore for React Native. iOS only, built with Expo Modules API.

- **CloudKit** (`iCloud`): Save, query, batch save, and delete records in the user's private CloudKit database. Automatic pagination, chunked batch uploads with retry, and typed error handling.
- **Key-Value Store** (`iCloudKVS`): Read and write small string values via `NSUbiquitousKeyValueStore` -- automatically synced across all of the user's devices.
- **Expo Config Plugin**: Automatically configures iCloud entitlements, CloudKit services, and KVS identifiers at build time. No manual Xcode setup.

## Installation

```bash
npm install react-native-icloud-kit
# or
yarn add react-native-icloud-kit
# or
bun add react-native-icloud-kit
```

Then install the native pods:

```bash
npx pod-install
```

### Prerequisites

- **Expo** >= 51.0.0 (uses Expo Modules API)
- **React Native** >= 0.74.0
- **iOS only** -- all methods return safe no-ops or throw on Android
- An **Apple Developer account** with an iCloud container configured

## Setup

### 1. Configure the Expo plugin

Add the plugin to your `app.json` (or `app.config.js`) with your iCloud container identifier:

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-icloud-kit/plugin/withICloud",
        {
          "containerIdentifier": "iCloud.com.yourcompany.yourapp"
        }
      ]
    ]
  }
}
```

This automatically:
- Adds `com.apple.developer.icloud-container-identifiers` to your entitlements
- Enables `CloudKit` in `com.apple.developer.icloud-services`
- Sets up the KVS ubiquity identifier (`com.apple.developer.ubiquity-kvstore-identifier`)
- Writes the container ID to `Info.plist` so the Swift module can read it at runtime

### 2. Create the iCloud container in Apple Developer Portal

1. Go to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list/cloudContainer)
2. Under **Identifiers**, select **iCloud Containers**
3. Click **+** and create a container matching your `containerIdentifier` (e.g., `iCloud.com.yourcompany.yourapp`)
4. Go to your **App ID** and enable the **iCloud** capability, then associate it with the container

### 3. Rebuild

```bash
npx expo prebuild --clean
npx expo run:ios
```

> **Note:** The container identifier does NOT need to match your bundle ID. For example, your app can be `com.yourcompany.yourapp` while your container is `iCloud.com.yourcompany.differentname`.

## API Reference

The library exports two objects: `iCloud` (CloudKit) and `iCloudKVS` (Key-Value Store).

```typescript
import { iCloud, iCloudKVS } from 'react-native-icloud-kit';
```

### Types

```typescript
type FieldValue = string | number | null;
type Fields = Record<string, FieldValue>;

interface CloudKitRecord {
  recordId: string;
  fields: Fields;
}

interface BatchRecord {
  fields: Fields;
  recordId?: string; // auto-generated UUID if omitted
}
```

---

### `iCloud.isAvailable()`

Check if the user is signed into iCloud.

```typescript
const available = await iCloud.isAvailable();
// true if signed in, false otherwise
// Always returns false on Android
```

---

### `iCloud.getUserRecordID()`

Get the current user's CloudKit record ID. Useful for diagnostics or identifying which iCloud account the data belongs to.

```typescript
try {
  const recordID = await iCloud.getUserRecordID();
  console.log('User record:', recordID);
  // e.g., "_abc123def456..."
} catch (error) {
  // Throws if iCloud is not available
}
```

---

### `iCloud.save(recordType, fields, recordId?)`

Save a single record to the user's private CloudKit database. Creates a new record, or overwrites an existing one if a record with the same `recordId` already exists.

| Parameter | Type | Description |
|---|---|---|
| `recordType` | `string` | The CloudKit record type (e.g., `"GameSession"`) |
| `fields` | `Fields` | Key-value pairs for the record |
| `recordId` | `string?` | Optional deterministic ID. Auto-generated UUID if omitted |

Returns the saved record's ID.

```typescript
const id = await iCloud.save('GameSession', {
  playerName: 'Alice',
  score: 42,
  datePlayed: Date.now(),
});
console.log('Saved record:', id);
```

**Deterministic IDs** allow idempotent saves -- if you save with the same `recordId` twice, the second save overwrites the first instead of creating a duplicate:

```typescript
const deterministicId = `session-${session.date}-${session.score}`;
await iCloud.save('GameSession', fields, deterministicId);
// Safe to call again -- same ID means same record is updated
```

---

### `iCloud.query(recordType, predicate?, limit?)`

Query records from the private CloudKit database. Supports filtering with NSPredicate syntax and automatic cursor-based pagination.

| Parameter | Type | Description |
|---|---|---|
| `recordType` | `string` | The CloudKit record type to query |
| `predicate` | `string?` | Optional NSPredicate format string. Defaults to all records |
| `limit` | `number?` | Max records to return. Defaults to all (paginated in batches of 200) |

Returns an array of `CloudKitRecord` objects.

```typescript
// Fetch all records of a type
const all = await iCloud.query('GameSession');

// Filter with NSPredicate
const hard = await iCloud.query('GameSession', 'nValue >= 3');

// Limit results
const recent = await iCloud.query('GameSession', undefined, 10);
```

> **Important:** For queries to work, the fields you filter on must be marked as **QUERYABLE** in [CloudKit Dashboard](https://icloud.developer.apple.com/dashboard/). At minimum, mark `recordName` as QUERYABLE for each record type.

---

### `iCloud.batchSave(recordType, records)`

Save multiple records in a single operation. Automatically handles CloudKit's per-request limits by chunking into batches of 400 and retrying with smaller batches if the server returns `limitExceeded`.

| Parameter | Type | Description |
|---|---|---|
| `recordType` | `string` | The CloudKit record type |
| `records` | `BatchRecord[]` | Array of records with fields and optional recordId |

Returns the count of successfully saved records.

```typescript
const records = sessions.map(s => ({
  fields: { score: s.score, date: s.date },
  recordId: `session-${s.id}`,  // optional deterministic ID
}));

const savedCount = await iCloud.batchSave('GameSession', records);
console.log(`Saved ${savedCount} of ${records.length} records`);
```

**Retry behavior:**
- Starts with chunks of 400 records
- If CloudKit returns `limitExceeded`, halves the chunk size and retries
- Individual records that fail are retried up to 2 times before being skipped
- Returns the total count of successfully saved records

---

### `iCloud.delete(recordType, recordId)`

Delete a single record by its ID.

| Parameter | Type | Description |
|---|---|---|
| `recordType` | `string` | The CloudKit record type |
| `recordId` | `string` | The record ID to delete |

Returns `true` on success.

```typescript
await iCloud.delete('GameSession', 'session-123');
```

---

### `iCloudKVS.set(key, value)`

Write a string value to `NSUbiquitousKeyValueStore`. The value is automatically synced across all of the user's devices via iCloud.

| Parameter | Type | Description |
|---|---|---|
| `key` | `string` | The key to store under |
| `value` | `string` | The string value to store. Use `JSON.stringify()` for objects |

```typescript
// Simple string
await iCloudKVS.set('username', 'Alice');

// Complex object as JSON
const config = { theme: 'dark', level: 5 };
await iCloudKVS.set('app_config', JSON.stringify(config));
```

> **Limits:** NSUbiquitousKeyValueStore allows up to 1 MB total storage and 1024 keys. Individual values should be kept small.

---

### `iCloudKVS.get(key)`

Read a string value from `NSUbiquitousKeyValueStore`.

| Parameter | Type | Description |
|---|---|---|
| `key` | `string` | The key to read |

Returns the stored string, or `null` if the key doesn't exist. Returns `null` on Android.

```typescript
const value = await iCloudKVS.get('app_config');
if (value) {
  const config = JSON.parse(value);
  console.log('Theme:', config.theme);
}
```

---

## Error Handling

CloudKit errors are mapped to typed exceptions:

| Error | Cause |
|---|---|
| `ICloudNotAvailableException` | User is not signed into iCloud |
| `ICloudQuotaExceededException` | iCloud storage is full |
| `ICloudNetworkException` | Network unavailable or connection failed |
| `ICloudRecordNotFoundException` | Record ID does not exist |
| `ICloudRateLimitedException` | Too many requests; includes retry-after interval |
| `ICloudException` | Any other CloudKit error |

```typescript
try {
  await iCloud.save('MyRecord', { key: 'value' });
} catch (error) {
  // error.message contains the specific reason
  console.error('CloudKit error:', error.message);
}
```

## Architecture Notes

- All CloudKit operations use the **private database** with a custom record zone (`RNICloudKitZone`). The zone is created automatically on the first operation and cached via `UserDefaults` to avoid redundant network calls.
- Operations run with `.userInitiated` QoS (Apple's default for CloudKit is low priority).
- The `save` function uses `savePolicy: .allKeys`, which means all fields are written on every save. This makes deterministic IDs safe for overwrites -- the entire record is replaced, not merged.
- Queries paginate in batches of 200 (CloudKit's recommended page size) using cursor-based pagination.
- Android: `iCloud.isAvailable()` returns `false`, `iCloudKVS.get()` returns `null`. All other methods throw with "iCloud is only available on iOS".

## License

MIT
