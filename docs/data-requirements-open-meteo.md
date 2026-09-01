# CEMS Data Requirements – Open-Meteo (Stand 01.09.2026)

Vendor-neutrale API-Mechanik für die wetterbasierte PV-Erwartung (ADR-012). Geschwister-Dokument zu `docs/data-requirements.md` (Wendeware/AMPERIX) – getrennt gehalten, weil eine unabhängige, unverwandte Datenquelle.

## API-Mechanik

**Endpoint:** `GET https://api.open-meteo.com/v1/forecast`

**Auth:** keine – öffentliches Free-Tier, kein API-Key nötig.

**Relevante Variablen** (`minutely_15`-Parameter, 15-Minuten-Raster):

- `global_tilted_irradiance` – Einstrahlung auf Modulebene [W/m²]. Wird **serverseitig** von Open-Meteo aus `tilt`/`azimuth` berechnet – CEMS muss GTI nicht selbst aus DNI/DHI herleiten.
- `temperature_2m` – Lufttemperatur 2 m über Boden [°C]
- `wind_speed_10m` – Windgeschwindigkeit 10 m über Boden [m/s]
- `cloud_cover` – Bewölkung [0..100 %]

**Azimuth-Konvention (Open-Meteo-Standard, nicht CEMS-erfunden):** 0° = Süd, +90° = West, −90° = Ost. Tilt = Modulneigung gegen die Horizontale, in Grad.

**Zeitspannen:** `past_days` (0–92 Tage rückwirkend) + `forecast_days` (0–16 Tage voraus), beide in ganzen Tagen. Für "künftige Wetterdaten + Soll-Ist-Vergleich" reicht ein kleines Fenster (z. B. `past_days=1, forecast_days=2`).

**Response-Form:** `minutely_15.time: string[]` plus parallele Arrays je Variable (Index-Korrespondenz zu `time`, wie bei Wendeware – kein Objekt pro Zeitpunkt). `utc_offset_seconds` im Payload gibt die Zeitzone des Standorts an.

**Kosten/Limits:** gratis im Rahmen des Free-Tiers, keine harten Rate-Limits dokumentiert; sinnvoller Cache/Pull-Rhythmus liegt im Minuten- bis Stundenbereich, nicht sekündlich.

**Nicht angebunden (bewusst, siehe Plan):** Die ERA5-Archive-API (`archive-api.open-meteo.com`, stündliche historische Reanalyse-Daten, 2–5 Tage Lag) für rückwirkende Curtailment-Analyse – erst wenn ein konkreter Bedarf dafür entsteht.

## PV-Leistungsmodell (Sandia-Zelltemperatur + PVWatts DC→AC)

Physikalisches Modell, kein Kundengeheimnis – Standardformeln aus der PV-Modellierungsliteratur (Sandia National Labs Zelltemperaturmodell, NREL PVWatts DC→AC-Clipping), extern bereits gegen eine reale Anlage validiert.

```
t_cell    = GTI × exp(sand_a + sand_b × wind) + t_air
t_factor  = 1 + gamma × (t_cell − 25)
p_dc      = (GTI / 1000) × kWp × t_factor × (1 − dc_loss)
p_ac      = min(p_dc, kW_ac) × inv_eff
```

**Default-Parameter** (validiert für SMA STP 110-60 + typische Modulreihe, als Startwert für andere Wechselrichter/Module übernehmbar, nicht anlagenspezifisch fixiert):

| Parameter | Wert    | Bedeutung                              |
| --------- | ------- | -------------------------------------- |
| `gamma`   | −0.0035 | Temperaturkoeffizient des Moduls (1/K) |
| `dc_loss` | 0.04    | Pauschale DC-seitige Verluste (4 %)    |
| `inv_eff` | 0.984   | Wechselrichter-Wirkungsgrad (98.4 %)   |
| `sand_a`  | −3.47   | Sandia-Zelltemperatur-Konstante        |
| `sand_b`  | −0.0594 | Sandia-Zelltemperatur-Konstante        |

**Edge Cases:**

- `GTI ≤ 0` → `0.0` (Nacht, keine Erzeugung)
- Sehr heiße Zelle (`t_factor < 1`) → `p_dc` proportional reduziert
- `p_dc > kW_ac` → Clipping auf AC-Nennleistung greift

**Eingangsgrößen pro Anlage** (Stammdaten, `assets.configuration` – ADR-012): Anlagen-DC-Leistung [kWp], Wechselrichter-AC-Nennleistung [kW] (Clipping-Grenze), Tilt [°], Azimuth [°].

## Datenschutz

Reale Standort-Koordinaten und Anlagenparameter aus Referenzprojekten werden nicht in dieses Dokument oder den Code übernommen – nur die vendor-neutrale API-Mechanik und die (kundenunabhängige) Modellformel.
