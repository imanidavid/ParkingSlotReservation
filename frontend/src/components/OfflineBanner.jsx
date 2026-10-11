import { useOffline } from "../lib/hooks.js";

/**
 * Sits directly under the app bar and appears when a call couldn't reach the
 * server at all — distinct from an error the server sent back, which belongs
 * next to whatever asked for it.
 */
export default function OfflineBanner() {
  if (!useOffline()) return null;
  return (
    <div className="offline" role="alert">
      <span>Can't reach the Karita server at {window.location.origin}. Is </span>
      <code>npm start</code>
      <span> running? </span>
      <button type="button" className="linkbtn" onClick={() => window.location.reload()}>
        Retry
      </button>
    </div>
  );
}
