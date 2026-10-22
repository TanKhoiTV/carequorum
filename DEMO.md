# Two-minute demo script

Record at 1440p or 1080p, 16:9. Have two windows ready: the browser at `http://localhost:3000`, and a slide or terminal behind it. Speak at ~140 wpm.

Target: **1:50–2:00**. Do not narrate the login mechanics for more than five seconds.

---

## 0:00–0:10 — The possibility

**On screen:** CareQuorum login screen.

> "This is CareQuorum. Two hospitals want to share Maya's oncology record tonight. Today that means an administrator with god-mode can read anything. Here, nobody can unlock it alone."

## 0:10–0:30 — The constraint

**On screen:** the request card, then scroll the policy panel.

> "A record unlock needs two things: Maya's own consent, and a treating clinician co-signing. Two distinct verified identities. An administrator is deliberately outside that quorum — not because a settings page says so, but because the policy can't be satisfied by one party."

## 0:30–1:00 — Beat 1: the override is refused

**On screen:** click **Try admin override**.

> "The obvious attack is the admin. Maya's hospital runs the server, so let's give the administrator everything — the realm, the database, the container."

**Click.** The red banner appears: *Override refused.*

> "Refused, and written into the audit trail. Administrative authority is not access authority. This is the part that would be impossible with ordinary login and backend permissions — there, the admin simply grants themselves the role."

## 1:00–1:30 — Beat 2: consent + co-sign

**On screen:** click **Approve as patient**, then **Co-sign as Dr. Chen (demo)**.

> "Now the legitimate path. Maya consents as herself — a DPoP-bound token, verified server-side. Dr. Chen co-signs with clinical need. Two distinct identities, and the quorum closes."

**On screen:** the policy ticks turn green; the pill flips to GRANTED.

> "TideCloak is doing the work here: every one of these actions is a signed, sender-constrained token that the server checks on every request. The browser isn't trusted for anything."

## 1:30–1:50 — Beat 3: a sealed window

**On screen:** click **Open record**. The record appears with a countdown.

> "The record opens for ten minutes, sealed to those two approvals and capped by policy. When the timer ends, the seal dies. Every read is in the audit trail, hash-chained, including the refusal."

## 1:50–2:00 — What changes

**On screen:** the record + audit trail, then cut to the title card.

> "That's the possibility: hospitals can share what matters, and no single administrator, vendor or cloud can override the patient. Removing unilateral control is what makes the sharing trustworthy enough to happen at all."

---

## Shot checklist

- [ ] Login screen visible, no error toasts
- [ ] Request card: Dr. Chen, St Vincent's, the clinical reason
- [ ] Override refusal banner captured cleanly (let it sit 3s)
- [ ] Both policy ticks green
- [ ] Record visible with countdown running
- [ ] Audit trail shows: `override.denied`, `approval.record`, `access.granted`, `record.read.allowed`
- [ ] No browser bookmarks bar / personal tabs visible

## Recording on Windows

`Win + Alt + R` (Xbox Game Bar) records the active window to `Videos\Captures`. Or OBS if installed.

Encode/compress to stay under 100 MB:

```powershell
ffmpeg -i raw.mp4 -vf "scale=1920:-2" -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k demo.mp4
```

Check the size, then commit `demo.mp4` to the repo root.
