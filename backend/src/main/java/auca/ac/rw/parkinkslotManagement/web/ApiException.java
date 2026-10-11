package auca.ac.rw.parkinkslotManagement.web;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * An error the user should see. Rendered as
 * {@code {"error": message, "field"?: name, "fields"?: {name: message}}} plus any extras.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String field;
    private final Map<String, String> fields;
    private final Map<String, Object> extra = new LinkedHashMap<>();

    public ApiException(HttpStatus status, String message) {
        this(status, message, null, null);
    }

    private ApiException(HttpStatus status, String message, String field, Map<String, String> fields) {
        super(message);
        this.status = status;
        this.field = field;
        this.fields = fields;
    }

    public static ApiException badRequest(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, message);
    }

    /** 400 tied to one input, e.g. field "plate". */
    public static ApiException field(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, message, field, null);
    }

    public static ApiException field(HttpStatus status, String field, String message) {
        return new ApiException(status, message, field, null);
    }

    /** 400 with several field messages. */
    public static ApiException fields(Map<String, String> fields) {
        return new ApiException(HttpStatus.BAD_REQUEST, "Check the highlighted fields.", null, fields);
    }

    public static ApiException fields(HttpStatus status, Map<String, String> fields) {
        return new ApiException(status, "Check the highlighted fields.", null, fields);
    }

    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, message);
    }

    public static ApiException conflict(String message) {
        return new ApiException(HttpStatus.CONFLICT, message);
    }

    public static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, message);
    }

    public ApiException with(String key, Object value) {
        extra.put(key, value);
        return this;
    }

    public HttpStatus status() {
        return status;
    }

    public Map<String, Object> body() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", getMessage());
        if (field != null) body.put("field", field);
        if (fields != null && !fields.isEmpty()) body.put("fields", fields);
        body.putAll(extra);
        return body;
    }
}
