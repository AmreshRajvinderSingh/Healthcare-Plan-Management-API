const authService = require("../config/auth.service");

const HEADER_KEY = "Bearer";
const authorized = () => {
  return async (req, res, next) => {
    try {
      const authToken = getToken(req);
      if (!authToken) {
        return res
          .status(401)
          .json({ error: true, message: "No token provided" });
      }

      const isUserAuthorized = await authService.isUserAuthorized(authToken);
      if (!isUserAuthorized) {
        return res
          .status(401)
          .json({ error: true, message: "User not authorized" });
      }

      next();
    } catch (error) {
      console.error("Authorixation Failed", error);
      return res
        .status(401)
        .json({ error: true, message: "Authorization failed" });
    }
  };
};

const getToken = (req) => {
  if (req.headers && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === HEADER_KEY) {
      return parts[1];
    }
  }
  return null;
};

module.exports = authorized;
