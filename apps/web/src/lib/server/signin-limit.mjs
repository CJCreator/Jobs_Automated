// Sign-in rate limits, kept apart from auth.ts and the route (which node --test cannot load) so
// they can be tested. The limiter is passed in: in the app it is takeRateLimit from rate-limit.ts,
// which counts in rate_events and throws an HttpError (429 when used up, 503 when it cannot count).

import { clientIp, emailSubject, ipSubject } from "./client-ip.mjs";

const refused = (err) => err?.name === "HttpError" && err.status === 429;

/**
 * Count one sign-in POST against the caller's IP, then run the Auth.js handler.
 * A refusal or an unavailable limiter throws before the handler is reached.
 */
export async function gateSignInPost({ headers, env = process.env, take, handler }) {
  await take("signInIp", ipSubject(clientIp(headers, env), env));
  return handler();
}

/**
 * Count one email-link request for an address. true: go ahead. false: this address has used its
 * sends for the hour. Any other failure (limiter unavailable) is thrown, so nothing is sent.
 */
export async function allowEmailLink({ email, env = process.env, take }) {
  try {
    await take("emailSend", emailSubject(email, env));
    return true;
  } catch (err) {
    if (refused(err)) return false;
    throw err;
  }
}
