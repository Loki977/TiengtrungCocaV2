module.exports = async (req, res) => {
  const { handlePlacementRequest } = await import('../../server/hsk-placement/api.mjs');
  return handlePlacementRequest('audio', req, res);
};
