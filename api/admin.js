module.exports = async (req, res) => {
  const { handleAdminRequest } = await import('../server/admin/api.mjs');
  return handleAdminRequest(req, res);
};
