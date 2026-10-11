package auca.ac.rw.parkinkslotManagement.service;

import auca.ac.rw.parkinkslotManagement.model.PaymentMethod;
import auca.ac.rw.parkinkslotManagement.model.PaymentStatus;
import auca.ac.rw.parkinkslotManagement.web.ApiException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Payment checks and a SIMULATED gateway (the documentation puts real
 * gateways out of scope). No money moves. Full card numbers and CVCs are
 * never stored; only a masked detail is kept.
 */
@Service
public class PaymentService {

    /** Card number that always declines, for trying the failure path. */
    static final String DECLINE_CARD = "4000000000000002";

    private static final Pattern MOMO = Pattern.compile("^2507[2389]\\d{7}$");
    private static final Pattern EXPIRY = Pattern.compile("^(\\d{2})\\s*/\\s*(\\d{2})$");

    public record Checked(PaymentMethod method, String detail, String reference, String cardNumber) {}

    public record Outcome(PaymentStatus status, PaymentMethod method, String detail, String reference, String error) {}

    /** Rwandan mobile numbers: +250 7[2389]X XXX XXX (MTN 078/079, Airtel 072/073). */
    static Optional<String> normalisePhone(String value) {
        String digits = value == null ? "" : value.replaceAll("[\\s-]", "");
        if (digits.startsWith("+")) digits = digits.substring(1);
        if (digits.startsWith("0")) digits = "250" + digits.substring(1);
        return MOMO.matcher(digits).matches() ? Optional.of(digits) : Optional.empty();
    }

    static boolean luhn(String number) {
        int sum = 0;
        for (int i = 0; i < number.length(); i++) {
            int d = number.charAt(number.length() - 1 - i) - '0';
            if (i % 2 == 1) {
                d *= 2;
                if (d > 9) d -= 9;
            }
            sum += d;
        }
        return sum % 10 == 0;
    }

    /** Validates the request body; throws 400 with per-field messages. */
    public Checked validate(Map<String, Object> body, LocalDate today) {
        Map<String, String> fields = new LinkedHashMap<>();
        String methodValue = Body.str(body, "method");
        String reference = Body.str(body, "reference").trim();
        Optional<PaymentMethod> method = PaymentMethod.fromLabel(methodValue);

        if (method.isEmpty()) fields.put("method", "Choose a payment method.");
        if (reference.length() > 80) fields.put("reference", "Keep the reference under 80 characters.");

        String detail = "";
        String cardNumber = "";

        if (method.orElse(null) == PaymentMethod.MOBILE_MONEY) {
            Optional<String> phone = normalisePhone(Body.str(body, "phone"));
            if (phone.isEmpty()) fields.put("phone", "Enter a Rwandan mobile number, e.g. +250 788 123 456.");
            else detail = "+250 ••• ••• " + phone.get().substring(phone.get().length() - 3);
        }

        if (method.orElse(null) == PaymentMethod.CARD) {
            cardNumber = Body.str(body, "cardNumber").replaceAll("[\\s-]", "");
            if (!cardNumber.matches("\\d{12,19}") || !luhn(cardNumber)) fields.put("cardNumber", "Check the card number.");

            Matcher exp = EXPIRY.matcher(Body.str(body, "expiry").trim());
            int month = exp.matches() ? Integer.parseInt(exp.group(1)) : 0;
            if (!exp.matches() || month < 1 || month > 12) {
                fields.put("expiry", "Use MM/YY.");
            } else {
                YearMonth expires = YearMonth.of(2000 + Integer.parseInt(exp.group(2)), month);
                if (expires.isBefore(YearMonth.from(today))) fields.put("expiry", "This card has expired.");
            }

            if (!Body.str(body, "cvc").trim().matches("\\d{3,4}")) fields.put("cvc", "3 or 4 digits.");
            if (!fields.containsKey("cardNumber")) {
                detail = "•••• " + cardNumber.substring(cardNumber.length() - 4);
            }
        }

        if (!fields.isEmpty()) throw ApiException.fields(fields);
        return new Checked(method.get(), detail, reference, cardNumber);
    }

    /** Simulated charge. Cash is collected at the gate, so it stays Pending. */
    public Outcome charge(Checked c) {
        if (c.method() == PaymentMethod.CASH) {
            return new Outcome(PaymentStatus.PENDING, PaymentMethod.CASH, "Pay at entry", c.reference(), null);
        }
        if (c.method() == PaymentMethod.CARD && DECLINE_CARD.equals(c.cardNumber())) {
            return new Outcome(PaymentStatus.FAILED, PaymentMethod.CARD, c.detail(), c.reference(),
                    "The card was declined. Try another card or method.");
        }
        return new Outcome(PaymentStatus.PAID, c.method(), c.detail(), c.reference(), null);
    }
}
