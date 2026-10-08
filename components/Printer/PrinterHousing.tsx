import styles from "./Printer.module.css";

type HousingProps = { idPrefix: string };
type HousingFrontProps = HousingProps & { stage: string; egg: boolean; available: boolean };

export function PrinterHousingBack({ idPrefix }: HousingProps) {
  const paint = (name: string) => `url(#${idPrefix}-${name})`;
  return <svg className={styles.housingBack} viewBox="240 240 1100 775" aria-hidden="true">
<defs>
<linearGradient id={`${idPrefix}-lidSheen`} gradientUnits="userSpaceOnUse" x1="340" y1="300" x2="760" y2="520"><stop offset="0" stopColor="#4a4b4e"/><stop offset=".5" stopColor="#1e1f21" stopOpacity=".6"/><stop offset="1" stopColor="#101011" stopOpacity="0"/></linearGradient>
<linearGradient id={`${idPrefix}-lidLow`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2e3032"/><stop offset="1" stopColor="#18191a"/></linearGradient>
  <linearGradient id={`${idPrefix}-shell`} gradientUnits="userSpaceOnUse" x1="330" y1="330" x2="1285" y2="935"><stop offset="0" stopColor="#fffcf7"/><stop offset=".35" stopColor="#f6f2ea"/><stop offset=".62" stopColor="#e2dcd2"/><stop offset=".85" stopColor="#bfb8ad"/><stop offset="1" stopColor="#a69f96"/></linearGradient>
  <linearGradient id={`${idPrefix}-shellX`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset=".8" stopColor="#8f877c" stopOpacity="0"/><stop offset="1" stopColor="#8f877c" stopOpacity=".35"/></linearGradient>
  <linearGradient id={`${idPrefix}-front`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#dfd9d4"/><stop offset=".5" stopColor="#d8d2cb"/><stop offset="1" stopColor="#d5cfc9"/></linearGradient>
  <linearGradient id={`${idPrefix}-lid`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34343a"/><stop offset=".12" stopColor="#1c1c1f"/><stop offset=".6" stopColor="#101011"/><stop offset="1" stopColor="#080808"/></linearGradient>
  <linearGradient id={`${idPrefix}-lidX`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#4a4a4f" stopOpacity=".55"/><stop offset=".1" stopColor="#000" stopOpacity="0"/><stop offset=".9" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#4a4a4f" stopOpacity=".5"/></linearGradient>
  <linearGradient id={`${idPrefix}-lidShadow`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#000" stopOpacity=".28"/><stop offset="1" stopColor="#000" stopOpacity="0"/></linearGradient>
  <linearGradient id={`${idPrefix}-foot`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3c3c3e"/><stop offset=".3" stopColor="#18181a"/><stop offset="1" stopColor="#030303"/></linearGradient>
  <linearGradient id={`${idPrefix}-roller`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6a6a6e"/><stop offset=".35" stopColor="#3a3a3d"/><stop offset="1" stopColor="#0d0d0e"/></linearGradient>
  <linearGradient id={`${idPrefix}-btn`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34373a"/><stop offset=".08" stopColor="#2b2e30"/><stop offset="1" stopColor="#1b1c1d"/></linearGradient>
  <radialGradient id={`${idPrefix}-ledOn`} cx=".4" cy=".35" r=".75"><stop offset="0" stopColor="#d6ffb0"/><stop offset=".4" stopColor="#5de824"/><stop offset="1" stopColor="#2aa808"/></radialGradient>
  <radialGradient id={`${idPrefix}-ledOff`} cx=".4" cy=".35" r=".8"><stop offset="0" stopColor="#a3a3a3"/><stop offset="1" stopColor="#6f6f70"/></radialGradient>
  <radialGradient id={`${idPrefix}-glow`}><stop offset="0" stopColor="#6cf03a" stopOpacity=".5"/><stop offset="1" stopColor="#6cf03a" stopOpacity="0"/></radialGradient>
  <pattern id={`${idPrefix}-teeth`} width="4" height="6" patternUnits="userSpaceOnUse"><rect width="4" height="6" fill="#161617"/><rect width="1.6" height="6" fill="#58585c"/></pattern>
  <filter id={`${idPrefix}-sh`} x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id={`${idPrefix}-sh2`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2"/></filter>

<radialGradient id={`${idPrefix}-ledBusy`} cx=".4" cy=".35" r=".75"><stop offset="0" stopColor="#daefff"/><stop offset=".4" stopColor="#74b7e0"/><stop offset="1" stopColor="#357ca7"/></radialGradient>
<radialGradient id={`${idPrefix}-ledError`} cx=".4" cy=".35" r=".75"><stop offset="0" stopColor="#fff0c5"/><stop offset=".4" stopColor="#e5b14b"/><stop offset="1" stopColor="#b67820"/></radialGradient>
<radialGradient id={`${idPrefix}-glowBusy`}><stop offset="0" stopColor="#74b7e0" stopOpacity=".5"/><stop offset="1" stopColor="#74b7e0" stopOpacity="0"/></radialGradient>
<radialGradient id={`${idPrefix}-glowError`}><stop offset="0" stopColor="#e5b14b" stopOpacity=".5"/><stop offset="1" stopColor="#e5b14b" stopOpacity="0"/></radialGradient>
<clipPath id={`${idPrefix}-frontOcclusion`}><rect x="240" y="478" width="1100" height="537"/></clipPath>
</defs>

{/* ground shadow */}
<ellipse cx="793" cy="962" rx="520" ry="9" fill="#000" opacity=".12" filter={paint("sh")}/>

<defs>
<clipPath id={`${idPrefix}-lc`}><path d="M472,292 H1112 C1130,292 1146,298 1155,312 L1201,490 C1210,505 1217,522 1217,545 V565 Q1217,589 1187,587 H366 Q336,589 336,565 V548 C336,520 343,505 347,490 L425,320 C435,303 452,292 472,292 Z"/></clipPath>
<linearGradient id={`${idPrefix}-lidTop`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b3c3f"/><stop offset=".5" stopColor="#2b2c2e"/><stop offset="1" stopColor="#242527"/></linearGradient>
<linearGradient id={`${idPrefix}-lidBase`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#43474a"/><stop offset=".2" stopColor="#303234"/><stop offset=".7" stopColor="#232425"/><stop offset="1" stopColor="#151617"/></linearGradient>
<linearGradient id={`${idPrefix}-lidSide`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5a5d62" stopOpacity=".5"/><stop offset=".12" stopColor="#5a5d62" stopOpacity="0"/><stop offset=".88" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".25"/></linearGradient>
<linearGradient id={`${idPrefix}-botShade`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#4a423a" stopOpacity=".35"/></linearGradient>
</defs>
{/* feet */}
<ellipse cx="793" cy="968" rx="500" ry="7" fill="#000" opacity=".12" filter={paint("sh")}/>
<path d="M364,936 H483 V950 Q483,968 465,968 H382 Q364,968 364,950 Z" fill={paint("foot")}/>
<path d="M1104,936 H1223 V950 Q1223,968 1205,968 H1122 Q1104,968 1104,950 Z" fill={paint("foot")}/>
<path d="M374,943 H474 M1114,943 H1213" stroke="#fff" strokeOpacity=".1" strokeWidth="2"/>
{/* beige shell */}
<path d="M301,860 L301,585 C301,560 306,540 312,525 L378,365 C392,335 410,318 440,303 L1139,305 C1170,318 1190,335 1204,360 L1272,525 C1279,540 1284,560 1284,585 L1284,860 C1284,905 1262,938 1223,938 H363 C325,938 301,905 301,860 Z" fill={paint("shell")}/>
<path d="M301,860 L301,585 C301,560 306,540 312,525 L378,365 C392,335 410,318 440,303 L1139,305 C1170,318 1190,335 1204,360 L1272,525 C1279,540 1284,560 1284,585 L1284,860 C1284,905 1262,938 1223,938 H363 C325,938 301,905 301,860 Z" fill={paint("shellX")}/>
<rect x="301" y="900" width="983" height="38" fill={paint("botShade")} clipPath={paint("sc")}/>
<clipPath id={`${idPrefix}-sc`}><path d="M301,860 L301,585 C301,560 306,540 312,525 L378,365 C392,335 410,318 440,303 L1139,305 C1170,318 1190,335 1204,360 L1272,525 C1279,540 1284,560 1284,585 L1284,860 C1284,905 1262,938 1223,938 H363 C325,938 301,905 301,860 Z"/></clipPath>
<path d="M314,525 L380,368 C393,338 411,322 441,307 M1202,365 C1190,340 1172,322 1146,312" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="2.5"/>
<path d="M312,540 L378,383 M1208,383 L1262,520" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="3"/>
{/* lid */}
<path d="M472,292 H1112 C1130,292 1146,298 1155,312 L1201,490 C1210,505 1217,522 1217,545 V565 Q1217,589 1187,587 H366 Q336,589 336,565 V548 C336,520 343,505 347,490 L425,320 C435,303 452,292 472,292 Z" fill="#000" opacity=".45" filter={paint("sh2")} transform="translate(0,3)"/>
<path d="M472,292 H1112 C1130,292 1146,298 1155,312 L1201,490 C1210,505 1217,522 1217,545 V565 Q1217,589 1187,587 H366 Q336,589 336,565 V548 C336,520 343,505 347,490 L425,320 C435,303 452,292 472,292 Z" fill={paint("lidTop")}/>
<g clipPath={paint("lc")}>
  <rect x="330" y="490" width="890" height="100" fill={paint("lidBase")}/>
  <rect x="330" y="285" width="890" height="305" fill={paint("lidSide")}/>
  <path d="M330,490.5 H1220" stroke="#9a9ea2" strokeOpacity=".8" strokeWidth="1.5"/>
  <path d="M330,492 H1220" stroke="#000" strokeOpacity=".5" strokeWidth="1.5"/>
  <path d="M330,528.5 H1220" stroke="#85898d" strokeOpacity=".45" strokeWidth="1.2"/>
  <path d="M502,331 L431,506 H1141 L1084,331 Z" fill="#1e1f21"/>
  <path d="M502,331 L431,506 H1141 L1084,331" fill="none" stroke="#85898d" strokeOpacity=".85" strokeWidth="1.6" strokeLinejoin="round"/>
  <path d="M504,334 L434,506 M1082,334 L1137,506" stroke="#000" strokeOpacity=".6" strokeWidth="2.5"/>
</g>
<path d="M425,320 C435,303 452,293 472,292.5 H1112 C1130,292.5 1146,299 1155,312" fill="none" stroke="#7a7e83" strokeOpacity=".8" strokeWidth="1.8"/>
<path d="M425,322 L347,490 C343,505 336,520 336,548 V565 Q336,587 358,587" fill="none" stroke="#8a8f94" strokeOpacity=".7" strokeWidth="2"/>
<path d="M346,570 Q352,584 372,585.5" fill="none" stroke="#b9c4cb" strokeOpacity=".9" strokeWidth="2.5"/>
<path d="M1201,490 C1210,505 1217,522 1217,545 V565" fill="none" stroke="#000" strokeOpacity=".5" strokeWidth="1.5"/>
{/* slot housing */}
<rect x="455" y="437" width="677" height="70" rx="9" fill="#08090a" stroke="#45464a" strokeWidth="1.6"/>
<path d="M468,445 V482 Q468,490 476,490 M1120,445 V482 Q1120,490 1112,490" fill="none" stroke="#5a5b5f" strokeWidth="2"/>
<rect x="468" y="437" width="35" height="45" rx="5" fill="#1b1c1e" stroke="#4d4e52" strokeWidth="1.3"/>
<rect x="1083" y="437" width="35" height="45" rx="5" fill="#1b1c1e" stroke="#4d4e52" strokeWidth="1.3"/>
<rect x="472" y="476" width="644" height="15" rx="3" fill="#050506"/>
<rect x="472" y="478" width="644" height="11" rx="2" fill={paint("teeth")}/>
<rect x="470" y="491" width="648" height="12" rx="4" fill="#26272a" stroke="#4a4b4f" strokeWidth="1"/>
<path d="M466,505 H1122" stroke="#000" strokeWidth="2"/>

  </svg>;
}

export function PrinterHousingFront({ idPrefix, stage, egg, available }: HousingFrontProps) {
  const paint = (name: string) => `url(#${idPrefix}-${name})`;
  const busy = ["warming", "handshake", "printing", "cutting"].includes(stage);
  const powerMaterial = !available ? "ledError" : busy ? "ledBusy" : "ledOn";
  const glowMaterial = !available ? "glowError" : busy ? "glowBusy" : "glow";
  return <svg className={styles.housingFront} viewBox="240 240 1100 775" aria-hidden="true">
<g clipPath={paint("frontOcclusion")}>{/* lid */}
<path d="M472,292 H1112 C1130,292 1146,298 1155,312 L1201,490 C1210,505 1217,522 1217,545 V565 Q1217,589 1187,587 H366 Q336,589 336,565 V548 C336,520 343,505 347,490 L425,320 C435,303 452,292 472,292 Z" fill="#000" opacity=".45" filter={paint("sh2")} transform="translate(0,3)"/>
<path d="M472,292 H1112 C1130,292 1146,298 1155,312 L1201,490 C1210,505 1217,522 1217,545 V565 Q1217,589 1187,587 H366 Q336,589 336,565 V548 C336,520 343,505 347,490 L425,320 C435,303 452,292 472,292 Z" fill={paint("lidTop")}/>
<g clipPath={paint("lc")}>
  <rect x="330" y="490" width="890" height="100" fill={paint("lidBase")}/>
  <rect x="330" y="285" width="890" height="305" fill={paint("lidSide")}/>
  <path d="M330,490.5 H1220" stroke="#9a9ea2" strokeOpacity=".8" strokeWidth="1.5"/>
  <path d="M330,492 H1220" stroke="#000" strokeOpacity=".5" strokeWidth="1.5"/>
  <path d="M330,528.5 H1220" stroke="#85898d" strokeOpacity=".45" strokeWidth="1.2"/>
  <path d="M502,331 L431,506 H1141 L1084,331 Z" fill="#1e1f21"/>
  <path d="M502,331 L431,506 H1141 L1084,331" fill="none" stroke="#85898d" strokeOpacity=".85" strokeWidth="1.6" strokeLinejoin="round"/>
  <path d="M504,334 L434,506 M1082,334 L1137,506" stroke="#000" strokeOpacity=".6" strokeWidth="2.5"/>
</g>
<path d="M425,320 C435,303 452,293 472,292.5 H1112 C1130,292.5 1146,299 1155,312" fill="none" stroke="#7a7e83" strokeOpacity=".8" strokeWidth="1.8"/>
<path d="M425,322 L347,490 C343,505 336,520 336,548 V565 Q336,587 358,587" fill="none" stroke="#8a8f94" strokeOpacity=".7" strokeWidth="2"/>
<path d="M346,570 Q352,584 372,585.5" fill="none" stroke="#b9c4cb" strokeOpacity=".9" strokeWidth="2.5"/>
<path d="M1201,490 C1210,505 1217,522 1217,545 V565" fill="none" stroke="#000" strokeOpacity=".5" strokeWidth="1.5"/>
{/* slot housing */}
<rect x="455" y="437" width="677" height="70" rx="9" fill="#08090a" stroke="#45464a" strokeWidth="1.6"/>
<path d="M468,445 V482 Q468,490 476,490 M1120,445 V482 Q1120,490 1112,490" fill="none" stroke="#5a5b5f" strokeWidth="2"/>
<rect x="468" y="437" width="35" height="45" rx="5" fill="#1b1c1e" stroke="#4d4e52" strokeWidth="1.3"/>
<rect x="1083" y="437" width="35" height="45" rx="5" fill="#1b1c1e" stroke="#4d4e52" strokeWidth="1.3"/>
<rect x="472" y="476" width="644" height="15" rx="3" fill="#050506"/>
<rect className={styles.cutterBlade} x="472" y="478" width="644" height="11" rx="2" fill={paint("teeth")}/>
<g className={styles.roller}><circle cx="481" cy="487" r="3" fill="#616166"/><path d="M481 484v6" stroke="#232327"/></g>
<rect x="470" y="491" width="648" height="12" rx="4" fill="#26272a" stroke="#4a4b4f" strokeWidth="1"/>
<path d="M466,505 H1122" stroke="#000" strokeWidth="2"/>
</g>
{/* front panel */}
<rect x="345" y="588" width="883" height="328" rx="8" fill="#000" opacity=".22" filter={paint("sh2")}/>
<path d="M345,604 Q345,587 362,587 H1211 Q1228,587 1228,604 V882 Q1228,916 1194,916 H379 Q345,916 345,882 Z" fill={paint("front")} stroke="#c9c2b8" strokeWidth="1.5"/>
<path d="M347,589 H1226" stroke="#fff" strokeOpacity=".7" strokeWidth="1.5"/>
<rect x="345" y="588" width="883" height="20" fill={paint("lidShadow")} opacity=".45"/>
<path d="M350,899 H1223" stroke="#c4bdb3" strokeOpacity=".7" strokeWidth="1.2"/>
<path d="M1227,598 V884" stroke="#6e655c" strokeOpacity=".7" strokeWidth="2"/>
<path d="M1229,600 V882" stroke="#fff" strokeOpacity=".6" strokeWidth="1.5"/>

{/* labels */}
<text fontFamily="var(--font-sans)" x="400" y="705" fontSize="46" fontWeight="600" fill="#1a1a1a" textLength="309" lengthAdjust="spacingAndGlyphs">git receipts</text>
<text fontFamily="var(--font-mono)" x="403" y="746" fontSize="20" fill="#767471" textLength="193" lengthAdjust="spacing">GR-02 / 80 MM</text>
<path d="M401,808.5 H1163" stroke="#b9b3ad" strokeWidth="1.5"/>
<path d="M401,810 H1163" stroke="#fff" strokeOpacity=".7" strokeWidth="1"/>
<text fontFamily="var(--font-mono)" x="402" y="843" fontSize="17.5" fill="#6e6c69" textLength="392" lengthAdjust="spacing">{egg ? "COFFEE BREAK - NO INK REQUIRED" : "DIRECT THERMAL - NO INK REQUIRED"}</text>
<g strokeLinecap="round">
  <path d="M1089,836 H1154 M1089,850 H1154 M1089,864 H1154" stroke="#c3bcad" strokeWidth="5"/>
  <path d="M1089,834.2 H1154 M1089,848.2 H1154 M1089,862.2 H1154" stroke="#8d877a" strokeOpacity=".5" strokeWidth="1.2"/>
  <path d="M1089,839 H1154 M1089,853 H1154 M1089,867 H1154" stroke="#fff" strokeOpacity=".8" strokeWidth="1.2"/>
</g>

{/* indicator panel */}
<rect x="919" y="640" width="262" height="147" rx="14" fill="#d6d0ca" stroke="#c0b9b0" strokeWidth="1.5"/>
<rect x="920" y="641" width="260" height="145" rx="13" fill="none" stroke="#fff" strokeOpacity=".35"/>
<circle cx="948" cy="673" r="30" fill={paint(glowMaterial)}/>
<g>
  <circle cx="948" cy="673" r="13" fill="#c3bcb3"/><circle className={styles.powerLed} cx="948" cy="673" r="11" fill={paint(powerMaterial)}/><ellipse cx="944" cy="668" rx="4" ry="2.6" fill="#fff" opacity=".6"/>
  <circle cx="948" cy="715" r="13" fill="#c3bcb3"/><circle cx="948" cy="715" r="11" fill={paint(stage === "printing" ? "ledBusy" : "ledOff")}/><ellipse cx="944" cy="710" rx="4" ry="2.4" fill="#fff" opacity=".25"/>
  <circle cx="948" cy="757" r="13" fill="#c3bcb3"/><circle cx="948" cy="757" r="11" fill={paint(available ? "ledOff" : "ledError")}/><ellipse cx="944" cy="752" rx="4" ry="2.4" fill="#fff" opacity=".25"/>
</g>
<g fontFamily="var(--font-mono)" fontSize="17" fill="#615f5c">
  <text x="977" y="680" textLength="54" lengthAdjust="spacing">POWER</text>
  <text x="977" y="722" textLength="54" lengthAdjust="spacing">PAPER</text>
  <text x="977" y="764" textLength="54" lengthAdjust="spacing">ERROR</text>
</g>

{/* feed button */}
<rect x="1070" y="653" width="100" height="116" rx="20" fill="#bdb6ac" opacity=".5"/>
<rect x="1074" y="657" width="92" height="108" rx="17" fill={paint("btn")} stroke="#000" strokeWidth="1.5"/>
<path d="M1084,659.5 H1156" stroke="#fff" strokeOpacity=".28" strokeWidth="1.5" strokeLinecap="round"/>
{/* side slot */}
<rect x="1241" y="650" width="26" height="112" rx="6" fill="#c3bcb3"/>
<rect x="1243" y="652" width="22" height="108" rx="5" fill="#d6d0ca" stroke="#b5aea5"/>
<rect x="1245" y="657" width="13" height="98" rx="4" fill="#3e3731"/>
<rect x="1258" y="657" width="3" height="98" rx="1.5" fill="#fff" opacity=".6"/>

  </svg>;
}
