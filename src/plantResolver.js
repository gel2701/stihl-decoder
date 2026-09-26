/**
 * Browser-safe and server-compatible STIHL Plant Resolver
 * Pure database-object logic for resolving factory codes to plant records.
 * Contains ZERO Node built-ins (no fs, path, url, crypto).
 */

export function resolvePlantRecord(database, factoryDigit) {
  if (!database || !factoryDigit) return null;

  if (database.factories && database.factories[factoryDigit]) {
    return database.factories[factoryDigit];
  }

  if (Array.isArray(database.plants)) {
    return database.plants.find((plant) => plant.plant_code === factoryDigit) || null;
  }

  if (database.plants && database.plants[factoryDigit]) {
    return database.plants[factoryDigit];
  }

  return null;
}
