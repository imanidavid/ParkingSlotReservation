package auca.ac.rw.parkinkslotManagement.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** Opening hours, durations, start times and pricing. Same rules the pages assume. */
public final class Hours {

    public static final LocalTime OPEN = LocalTime.of(6, 0);
    public static final LocalTime CLOSE = LocalTime.of(22, 0);
    public static final int HORIZON_DAYS = 30;
    public static final int MIN_STAY_MIN = 60;
    public static final int NO_SHOW_GRACE_MIN = 15;
    public static final int FULL_DAY_BILLED_HOURS = 8;

    public record Duration(String id, int hours, String label) {}

    public static final List<Duration> DURATIONS = List.of(
            new Duration("1h", 1, "1H"),
            new Duration("2h", 2, "2H"),
            new Duration("4h", 4, "4H"),
            new Duration("8h", 8, "8H"),
            new Duration("day", 16, "FULL DAY"));

    public record Window(LocalDateTime start, LocalDateTime end) {}

    private static final DateTimeFormatter HM = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("uuuu-MM-dd").withResolverStyle(ResolverStyle.STRICT);
    private static final DateTimeFormatter INPUT = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm").withResolverStyle(ResolverStyle.STRICT);

    private Hours() {}

    public static Optional<Duration> duration(String id) {
        return DURATIONS.stream().filter(d -> d.id().equals(id)).findFirst();
    }

    public static int price(int rate, Duration d) {
        return rate * (d.id().equals("day") ? FULL_DAY_BILLED_HOURS : d.hours());
    }

    /** Billed per started hour, capped at the full-day price. */
    public static int priceForMinutes(int rate, long minutes) {
        long hours = (minutes + 59) / 60;
        return (int) (rate * Math.min(hours, FULL_DAY_BILLED_HOURS));
    }

    /** Start times a driver can pick for a date and duration. */
    public static List<String> startTimes(LocalDate date, Duration d, LocalDateTime now) {
        LocalDate today = now.toLocalDate();
        LocalTime nowTime = now.toLocalTime().truncatedTo(ChronoUnit.MINUTES);
        List<String> out = new ArrayList<>();
        if (date.isBefore(today)) return out;
        if (d.id().equals("day")) {
            if (date.isAfter(today) || nowTime.isBefore(CLOSE)) out.add(hm(OPEN));
            return out;
        }
        int open = OPEN.toSecondOfDay() / 60;
        int close = CLOSE.toSecondOfDay() / 60;
        int nowMin = nowTime.toSecondOfDay() / 60;
        for (int m = open; m + d.hours() * 60 <= close; m += 60) {
            if (date.isAfter(today) || m >= nowMin) out.add(hm(LocalTime.of(m / 60, m % 60)));
        }
        return out;
    }

    public static Window window(LocalDate date, String start, Duration d) {
        if (d.id().equals("day")) return new Window(date.atTime(OPEN), date.atTime(CLOSE));
        LocalDateTime s = date.atTime(LocalTime.parse(start, HM));
        return new Window(s, s.plusHours(d.hours()));
    }

    /** The window list views use: the next bookable start that day (08:00 on future days). */
    public static Optional<Window> defaultWindow(LocalDate date, Duration d, LocalDateTime now) {
        List<String> options = startTimes(date, d, now);
        if (options.isEmpty()) return Optional.empty();
        String start = options.contains("08:00") && date.isAfter(now.toLocalDate()) ? "08:00" : options.get(0);
        return Optional.of(window(date, start, d));
    }

    public static String durationText(LocalDateTime start, LocalDateTime end) {
        if (start.toLocalTime().equals(OPEN) && end.toLocalTime().equals(CLOSE)) return "FULL DAY";
        return durationText(ChronoUnit.MINUTES.between(start, end));
    }

    public static String durationText(long minutes) {
        long h = minutes / 60;
        long m = minutes % 60;
        List<String> parts = new ArrayList<>();
        if (h > 0) parts.add(h + (h == 1 ? " HOUR" : " HOURS"));
        if (m > 0) parts.add(m + " MIN");
        return String.join(" ", parts);
    }

    public static String hm(LocalTime t) {
        return t.format(HM);
    }

    public static String hm(LocalDateTime t) {
        return t.format(HM);
    }

    public static String stamp(LocalDateTime t) {
        return t.format(STAMP);
    }

    public static Optional<LocalDate> parseDate(String value) {
        try {
            return value == null ? Optional.empty() : Optional.of(LocalDate.parse(value, DATE));
        } catch (DateTimeParseException e) {
            return Optional.empty();
        }
    }

    /** "2026-09-24 08:00" (the reschedule input format). */
    public static Optional<LocalDateTime> parseInput(String value) {
        try {
            return value == null ? Optional.empty() : Optional.of(LocalDateTime.parse(value.trim(), INPUT));
        } catch (DateTimeParseException e) {
            return Optional.empty();
        }
    }

    public static LocalDateTime minute(LocalDateTime t) {
        return t.truncatedTo(ChronoUnit.MINUTES);
    }
}
