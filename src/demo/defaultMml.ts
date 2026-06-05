export const defaultMml = `%fm @16 name="GlassBell"
algorithm=0
feedback=2
op1 ratio=1.00 detune=0 level=0.90 attack=0.01 decay=0.35 sustain=0.35 release=0.18
op2 ratio=2.00 detune=0 level=0.45 attack=0.01 decay=0.20 sustain=0.05 release=0.12
%end

%fm @17 name="FourOpLead"
algorithm=0
feedback=3
op1 ratio=1.00 detune=0 level=0.85 attack=0.01 decay=0.30 sustain=0.45 release=0.18
op2 ratio=2.00 detune=0 level=0.42 attack=0.01 decay=0.22 sustain=0.20 release=0.12
op3 ratio=3.00 detune=0 level=0.30 attack=0.01 decay=0.16 sustain=0.10 release=0.10
op4 ratio=4.00 detune=0 level=0.20 attack=0.01 decay=0.12 sustain=0.00 release=0.08
%end

// MML Player PWA demo
// FM patches, repeats, slur/tie, measures, noise, and multiple tracks.
#TIME 4/4
T132
O4 L8 V12 Q7 @17
[: C E G > C < G E D & E | F A > C F < A F E & F | :2]
G4&G8 A8 B8 > C8 < B8 A8 G8 E8 | C4 R4 @16 E8 G8 > C8 < G8 |
,
T132
O2 L8 V10 Q8 @5
[: C4 G4 C4 G4 | F4 > C4 < F4 C4 | :2]
G4 D4 G4 D4 | C2 R2 |
,
T132
O3 L8 V9 Q6 @16
R4 [: C E G > C < G E | D F A > D < A F | :2]
C2. R4 |
,
T132
O3 L8 V8 Q4 @6
[: C R C R C C R C | C R C R C C C R | :2]
C4 R4 C8 C8 R4 |`;
