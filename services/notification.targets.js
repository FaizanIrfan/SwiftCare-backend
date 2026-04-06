const DEFAULT_ADMIN_ID = 'admin-swiftcare-001';

function getAdminUserIds() {
  const fromEnv = String(process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (fromEnv.length > 0) return fromEnv;
  return [DEFAULT_ADMIN_ID];
}

module.exports = {
  getAdminUserIds,
  DEFAULT_ADMIN_ID
};
