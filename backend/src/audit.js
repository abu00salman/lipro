// Append-only audit trail. Metadata must never contain raw PII or secrets.
export async function writeAudit(db, { actorId = null, action, entity, entityId = null, branchId = null, meta = {}, ipHash = null }) {
  await db
    .prepare(
      'INSERT INTO audit_log (actor_id, action, entity, entity_id, branch_id, meta_json, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(actorId, action, entity, entityId === null ? null : String(entityId), branchId, JSON.stringify(meta), ipHash)
    .run();
}
