const { OAuth2Client } = require("google-auth-library");

const gmailOAuth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const axios = require("axios");

const isUserAuthorized= async(token)=>{
    try{
        const discoveryURL="https://accounts.google.com/.well-known/openid-configuration";
        const response= await axios.get(discoveryURL);
        const discoveryDocument= response.data;



        const ticket= await gmailOAuth2Client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload= ticket.getPayload();

        if (!payload || !payload.iss || payload.iss !== discoveryDocument.issuer) {
            throw new Error("invalid issuer");
          }
      
          return true; // Authorized
    }catch(error)
    {
        console.error("Invalid Token or Expired Token ", error.message);
        return false; // Not authorized
    }
};



module.exports = {
    isUserAuthorized,
  };