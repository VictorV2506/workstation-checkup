/* eslint-disable */
const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");

setGlobalOptions({maxInstances: 10});

const BASE = "https://api.toqan.ai/api";

const CORS = {
  "Access-Control-Allow-Origin": "https://workstation-revamp.web.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function setCORS(res) {
  Object.entries(CORS).forEach(([k, v]) => res.set(k, v));
}

exports.toqanCreate = onRequest(async (req, res) => {
  setCORS(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  try {
    const r = await fetch(BASE + "/create_conversation", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.TOQAN_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({user_message: req.body.user_message}),
    });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(500).json({error: e.message});
  }
});

exports.toqanContinue = onRequest(async (req, res) => {
  setCORS(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  try {
    const r = await fetch(BASE + "/continue_conversation", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.TOQAN_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversation_id: req.body.conversation_id,
        user_message: req.body.user_message,
      }),
    });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(500).json({error: e.message});
  }
});
