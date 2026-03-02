import ExpoModulesCore
import CloudKit

// MARK: - Exceptions

class ICloudNotAvailableException: Exception {
  override var reason: String { "iCloud account is not available on this device" }
}

class ICloudQuotaExceededException: Exception {
  override var reason: String { "iCloud storage quota exceeded" }
}

class ICloudNetworkException: GenericException<String> {
  override var reason: String { "CloudKit network error: \(param)" }
}

class ICloudRecordNotFoundException: GenericException<String> {
  override var reason: String { "Record not found: \(param)" }
}

class ICloudRateLimitedException: GenericException<Double> {
  override var reason: String { "CloudKit rate limited. Retry after \(param) seconds" }
}

class ICloudException: GenericException<String> {
  override var reason: String { "CloudKit error: \(param)" }
}

// MARK: - Module

public class ICloudKitModule: Module {
  private static let zoneName = "RNICloudKitZone"
  private static let zoneCreatedKey = "rn_icloudkit_zone_created"

  private var container: CKContainer {
    if let id = Bundle.main.object(forInfoDictionaryKey: "ICloudKitContainerIdentifier") as? String {
      return CKContainer(identifier: id)
    }
    return CKContainer.default()
  }

  private var zone: CKRecordZone {
    CKRecordZone(zoneName: Self.zoneName)
  }

  public func definition() -> ModuleDefinition {
    Name("ICloudKit")

    // MARK: isAvailable

    AsyncFunction("isAvailable") { () -> Bool in
      let status = try await self.container.accountStatus()
      return status == .available
    }

    // MARK: getUserRecordID

    AsyncFunction("getUserRecordID") { () -> String in
      let recordID = try await self.container.userRecordID()
      return recordID.recordName
    }

    // MARK: save

    AsyncFunction("save") { (recordType: String, fields: [String: Any?], recordId: String?) -> String in
      try await self.withQoS { db in
        try await self.ensureZoneExists(db: db)

        let recordName = recordId ?? UUID().uuidString
        let ckRecordID = CKRecord.ID(recordName: recordName, zoneID: self.zone.zoneID)
        let record = CKRecord(recordType: recordType, recordID: ckRecordID)

        self.setFields(on: record, from: fields)

        let (saveResults, _) = try await db.modifyRecords(
          saving: [record], deleting: [],
          savePolicy: .allKeys, atomically: false
        )

        // Check result for the single record
        if let result = saveResults[ckRecordID] {
          switch result {
          case .success(let savedRecord):
            return savedRecord.recordID.recordName
          case .failure(let error):
            throw self.mapCKError(error)
          }
        }

        return recordName
      }
    }

    // MARK: query

    AsyncFunction("query") { (recordType: String, predicate: String?, limit: Int?) -> [[String: Any?]] in
      try await self.withQoS { db in
        try await self.ensureZoneExists(db: db)

        let nsPredicate: NSPredicate
        if let predicateStr = predicate, !predicateStr.isEmpty {
          nsPredicate = NSPredicate(format: predicateStr)
        } else {
          nsPredicate = NSPredicate(value: true)
        }

        let query = CKQuery(recordType: recordType, predicate: nsPredicate)
        let resultsLimit = limit ?? 0 // 0 = fetch all with pagination

        var allRecords: [[String: Any?]] = []
        var cursor: CKQueryOperation.Cursor? = nil

        // First fetch
        let pageLimit = resultsLimit > 0 ? min(resultsLimit, 200) : 200
        let (matchResults, queryCursor) = try await db.records(
          matching: query,
          inZoneWith: self.zone.zoneID,
          resultsLimit: pageLimit
        )

        for (_, result) in matchResults {
          if case .success(let record) = result {
            allRecords.append(self.recordToDict(record))
          }
        }
        cursor = queryCursor

        // Paginate if needed
        while let activeCursor = cursor {
          if resultsLimit > 0 && allRecords.count >= resultsLimit {
            break
          }

          let remaining = resultsLimit > 0 ? resultsLimit - allRecords.count : 200
          let nextLimit = min(remaining, 200)

          let (nextResults, nextCursor) = try await db.records(
            continuingMatchFrom: activeCursor,
            resultsLimit: nextLimit
          )

          for (_, result) in nextResults {
            if case .success(let record) = result {
              allRecords.append(self.recordToDict(record))
            }
          }
          cursor = nextCursor
        }

        return allRecords
      }
    }

    // MARK: batchSave

    AsyncFunction("batchSave") { (recordType: String, records: [[String: Any?]]) -> Int in
      try await self.withQoS { db in
        try await self.ensureZoneExists(db: db)

        // Build CKRecords
        var ckRecords: [CKRecord] = []
        for recordDict in records {
          let fields = recordDict["fields"] as? [String: Any?] ?? [:]
          let recordId = recordDict["recordId"] as? String ?? UUID().uuidString

          let ckRecordID = CKRecord.ID(recordName: recordId, zoneID: self.zone.zoneID)
          let record = CKRecord(recordType: recordType, recordID: ckRecordID)
          self.setFields(on: record, from: fields)
          ckRecords.append(record)
        }

        // Save in chunks with limitExceeded retry
        return try await self.batchSaveChunked(ckRecords, db: db)
      }
    }

    // MARK: delete

    AsyncFunction("delete") { (recordType: String, recordId: String) -> Bool in
      try await self.withQoS { db in
        try await self.ensureZoneExists(db: db)

        let ckRecordID = CKRecord.ID(recordName: recordId, zoneID: self.zone.zoneID)

        let (_, deleteResults) = try await db.modifyRecords(
          saving: [], deleting: [ckRecordID],
          savePolicy: .allKeys, atomically: false
        )

        if let result = deleteResults[ckRecordID] {
          switch result {
          case .success:
            return true
          case .failure(let error):
            throw self.mapCKError(error)
          }
        }

        return true
      }
    }
  }

  // MARK: - Private helpers

  /// Executes a CloudKit operation with `.userInitiated` QoS.
  /// Apple docs: "By default, CloudKit executes the methods in this class with a
  /// low-priority quality of service."
  private func withQoS<T>(_ body: @Sendable (CKDatabase) async throws -> T) async throws -> T {
    let db = container.privateCloudDatabase
    let config = CKOperation.Configuration()
    config.qualityOfService = .userInitiated
    return try await db.configuredWith(configuration: config) { configuredDB in
      try await body(configuredDB)
    }
  }

  /// Creates the custom record zone if it hasn't been created yet.
  /// Uses a UserDefaults flag to avoid redundant CloudKit calls on every app launch.
  /// `modifyRecordZones(saving:)` is idempotent — creating an already-existing zone
  /// returns success, not an error.
  private func ensureZoneExists(db: CKDatabase) async throws {
    if UserDefaults.standard.bool(forKey: Self.zoneCreatedKey) {
      return
    }

    _ = try await db.modifyRecordZones(saving: [zone], deleting: [])
    UserDefaults.standard.set(true, forKey: Self.zoneCreatedKey)
  }

  /// Sets CKRecord fields from a JS dictionary.
  /// Supports String, Int, Double, and nil values.
  private func setFields(on record: CKRecord, from fields: [String: Any?]) {
    for (key, value) in fields {
      if let strVal = value as? String {
        record[key] = strVal as CKRecordValue
      } else if let intVal = value as? Int64 {
        record[key] = intVal as CKRecordValue
      } else if let intVal = value as? Int {
        record[key] = Int64(intVal) as CKRecordValue
      } else if let doubleVal = value as? Double {
        record[key] = doubleVal as CKRecordValue
      } else if value == nil || value is NSNull {
        record[key] = nil
      }
    }
  }

  /// Converts a CKRecord to a JS-friendly dictionary.
  private func recordToDict(_ record: CKRecord) -> [String: Any?] {
    var fields: [String: Any?] = [:]
    for key in record.allKeys() {
      let value = record[key]
      if let strVal = value as? String {
        fields[key] = strVal
      } else if let intVal = value as? Int64 {
        fields[key] = intVal
      } else if let doubleVal = value as? Double {
        fields[key] = doubleVal
      } else if let dateVal = value as? Date {
        // Dates are sent as Unix ms timestamps (matching JS Date.now())
        fields[key] = dateVal.timeIntervalSince1970 * 1000.0
      } else {
        fields[key] = nil
      }
    }
    return [
      "recordId": record.recordID.recordName,
      "fields": fields,
    ]
  }

  /// Saves records in chunks with automatic `limitExceeded` retry.
  /// Starts with chunks of 400. If the server returns `limitExceeded`,
  /// halves the chunk size and retries.
  /// Individual record failures are retried up to 2 times before being skipped.
  private func batchSaveChunked(_ records: [CKRecord], db: CKDatabase) async throws -> Int {
    var chunkSize = min(records.count, 400)
    var saved = 0
    var remaining = records
    let maxRetries = 2
    var retryCounts: [CKRecord.ID: Int] = [:]

    while !remaining.isEmpty {
      let chunk = Array(remaining.prefix(chunkSize))

      do {
        let (saveResults, _) = try await db.modifyRecords(
          saving: chunk, deleting: [],
          savePolicy: .allKeys, atomically: false
        )

        var failures: [CKRecord] = []
        for (id, result) in saveResults {
          switch result {
          case .success:
            saved += 1
          case .failure:
            if let failedRecord = chunk.first(where: { $0.recordID == id }) {
              let count = (retryCounts[id] ?? 0) + 1
              if count <= maxRetries {
                retryCounts[id] = count
                failures.append(failedRecord)
              }
              // else: skip this record — exceeded max retries
            }
          }
        }
        // Advance past the chunk, then add back any retryable failures
        remaining = Array(remaining.dropFirst(chunk.count)) + failures
      } catch let error as CKError where error.code == .limitExceeded {
        // Server rejected the batch size — halve and retry
        chunkSize = max(chunkSize / 2, 1)
        continue
      } catch {
        throw self.mapCKError(error)
      }
    }

    return saved
  }

  /// Maps CKError codes to typed JS exceptions.
  private func mapCKError(_ error: any Error) -> any Error {
    guard let ckError = error as? CKError else {
      return ICloudException(error.localizedDescription)
    }

    switch ckError.code {
    case .notAuthenticated:
      return ICloudNotAvailableException()
    case .quotaExceeded:
      return ICloudQuotaExceededException()
    case .networkUnavailable, .networkFailure:
      return ICloudNetworkException(ckError.localizedDescription)
    case .unknownItem:
      return ICloudRecordNotFoundException(ckError.localizedDescription)
    case .requestRateLimited:
      let retryAfter = ckError.retryAfterSeconds ?? 0
      return ICloudRateLimitedException(retryAfter)
    default:
      return ICloudException(ckError.localizedDescription)
    }
  }
}
