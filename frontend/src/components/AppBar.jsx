import { Fragment, useEffect, useState } from "react";
import { me } from "../lib/api.js";
import ThemeToggle from "./ThemeToggle.jsx";

const NAV = {
  driver: {
    home: "home.html",
    items: [
      { id: "browse", label: "Browse", href: "browse.html" },
      { id: "reservations", label: "Reservations", href: "reservations.html" },
      { id: "payments", label: "Payments", href: "reservations.html#past" },
    ],
  },
  admin: {
    home: "admin.html",
    items: [
      { id: "facilities", label: "Facilities", href: "admin.html#facilities" },
      { id: "slots", label: "Slots", href: "admin.html#slots" },
      { id: "reservations", label: "Reservations", href: "admin.html#reservations" },
      { id: "revenue", label: "Revenue", href: "admin.html#revenue" },
    ],
  },
  attendant: {
    home: "attendant.html",
    items: [
      { id: "verify", label: "Verify", href: "attendant.html#verify" },
      { id: "board", label: "Live board", href: "attendant.html#board" },
    ],
  },
};

export default function AppBar({ nav = "driver", active }) {
  const [who, setWho] = useState(null);
  const { home, items } = NAV[nav];

  useEffect(() => {
    let live = true;
    me().then((m) => live && setWho(m)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <header className="appbar" data-appbar="" data-nav={nav === "driver" ? undefined : nav} data-active={active}>
      <div className="appbar__inner">
        <a className="appbar__mark" href={home}>
          KARITA
        </a>
        <nav className="appbar__nav" aria-label="Main">
          {items.map((item, i) => (
            <Fragment key={item.id}>
              {i ? (
                <span className="appbar__dot" aria-hidden="true">
                  ·
                </span>
              ) : null}
              <a href={item.href} aria-current={item.id === active ? "page" : undefined}>
                {item.label}
              </a>
            </Fragment>
          ))}
        </nav>
        <div className="appbar__meta">
          <span className="appbar__role">
            {who ? who.role.toUpperCase() : " "}
            {who?.facility ? <span className="appbar__facility">{" · " + who.facility.toUpperCase()}</span> : null}
          </span>
          <ThemeToggle />
          <a className="link appbar__logout" href="/logout">
            Logout
          </a>
        </div>
      </div>
    </header>
  );
}
