module.exports = async (req, res) => {
  const { handleWritingRequest } = await import('../server/writing/api.mjs');
  return handleWritingRequest(req, res);
};
