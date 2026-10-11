import { useCallback, useEffect, useState } from "react";
import AppBar from "../components/AppBar.jsx";
import OfflineBanner from "../components/OfflineBanner.jsx";
import { api } from "../lib/api.js";
import FacilitiesPane from "./admin/FacilitiesPane.jsx";
import SlotsPane from "./admin/SlotsPane.jsx";
import ReservationsPane from "./admin/ReservationsPane.jsx";
import RevenuePane from "./admin/RevenuePane.jsx";

const PANES = ["facilities", "slots", "reservations", "revenue"];

/**
 * One page, four sections; the hash picks which — #facilities,
 * #slots?facility=kcc&level=P1, #reservations, #revenue. The hash rather than
 * a router because the admin console is a single protected page as far as
 * PageAccessFilter is concerned, and this keeps deep links working without
 * teaching the server about client-side routes.
 */
function useHashRoute() {
  const read = () => {
    const hash = window.location.hash.replace(/^#/, "");
    const [name, query] = hash.split("?");
    return {
      name: PANES.includes(name) ? name : "facilities",
      params: new URLSearchParams(query || ""),
    };
  };
  const [route, setRoute] = useState(read);

  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}

export default function Admin() {
  const { name, params } = useHashRoute();
  const [facilities, setFacilities] = useState([]);
  const [meta, setMeta] = useState({ facilityTypes: [], vehicleTypes: [] });
  const [error, setError] = useState("");

  const loadFacilities = useCallback(async () => {
    try {
      const res = await api("/api/admin/facilities");
      setMeta({ facilityTypes: res.facilityTypes, vehicleTypes: res.vehicleTypes });
      setFacilities(res.facilities);
      return res.facilities;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, []);

  useEffect(() => {
    loadFacilities();
  }, [loadFacilities]);

  useEffect(() => {
    document.title = name.charAt(0).toUpperCase() + name.slice(1) + " · Admin · Karita";
  }, [name]);

  // Written with replaceState on purpose: a filter change should update the
  // link without pushing a history entry or re-running the route.
  const setHash = useCallback((pane, query) => {
    const qs = query ? new URLSearchParams(query).toString() : "";
    const next = "#" + pane + (qs ? "?" + qs : "");
    if (window.location.hash !== next) history.replaceState(null, "", next);
  }, []);

  // The slots pane needs the facility list before it can resolve the one in
  // the hash, so hold the console until the first load lands.
  const waiting = !facilities.length && !error;

  return (
    <>
      <AppBar nav="admin" active={name} />
      <OfflineBanner />

      <main className="console" id="console">
        <h1 className="sr-only">Admin</h1>

        {waiting ? null : name === "facilities" ? (
          <FacilitiesPane facilities={facilities} meta={meta} reload={loadFacilities} error={error} setError={setError} />
        ) : name === "slots" ? (
          <SlotsPane facilities={facilities} meta={meta} reloadFacilities={loadFacilities} params={params} setHash={setHash} />
        ) : name === "reservations" ? (
          <ReservationsPane facilities={facilities} params={params} setHash={setHash} />
        ) : (
          <RevenuePane />
        )}
      </main>
    </>
  );
}
