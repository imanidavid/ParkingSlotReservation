package auca.ac.rw.parkinkslotManagement.service;

import java.util.Map;

/** Lenient reads from a JSON object body: missing or null becomes "". */
public final class Body {

    private Body() {}

    public static String str(Map<String, Object> body, String key) {
        Object v = body == null ? null : body.get(key);
        return v == null ? "" : String.valueOf(v);
    }

    public static boolean has(Map<String, Object> body, String key) {
        return body != null && body.containsKey(key);
    }
}
