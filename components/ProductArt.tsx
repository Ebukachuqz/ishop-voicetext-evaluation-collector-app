const colors: Record<string, string> = {blue: "#65aef3", black: "#47434f", mint: "#72d8b5", coral: "#ff8b90", yellow: "#ffd868", lavender: "#b79bea"};

export default function ProductArt({name, color}: {name: string; color: string}) {
  const fill = colors[color] ?? "#b79bea";
  const tote = name.includes("Tote");
  const hoodie = name.includes("Hoodie");
  return <svg className="product-art" viewBox="0 0 180 166" aria-hidden="true">
    <ellipse cx="89" cy="148" rx="48" ry="7" fill="#3e2c50" opacity=".11"/>
    <path d="m22 39 3-7 3 7 7 3-7 3-3 7-3-7-7-3zM151 105l3-6 3 6 6 3-6 3-3 6-3-6-6-3z" fill="#fff" stroke="#493650" strokeWidth="1.5"/>
    <circle cx="145" cy="33" r="5" fill="#fff"/>
    <g stroke="#493650" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
      {tote ? <><path d="M61 58v-9a29 29 0 0 1 58 0v9" fill="none"/><path d="M48 56h84l8 83H40z" fill={fill}/><path d="M67 60v-9a23 23 0 0 1 46 0v9" fill="none"/></> : <><path d="m62 39-31 18 17 33 14-8v58h56V82l14 8 17-33-31-18c-9 10-47 10-56 0z" fill={fill}/>{hoodie ? <><path d="M63 42c-5-36 60-36 54 0L91 60z" fill={fill}/><path d="M80 61v21m22-21v21M70 112h40l-5 14H75z" fill="none" strokeWidth="2.5"/></> : <path d="M63 40c6 22 47 22 54 0" fill="none" strokeWidth="3"/>}</>}
      <g fill={color === "black" ? "#fff6e5" : "#493650"} stroke="none"><ellipse cx="80" cy={hoodie ? "94" : "88"} rx="3" ry="4"/><ellipse cx="101" cy={hoodie ? "94" : "88"} rx="3" ry="4"/></g>
      <path d={hoodie ? "M85 102q6 7 12 0" : "M84 98q7 8 14 0"} stroke={color === "black" ? "#fff6e5" : "#493650"} strokeWidth="2.5" fill="none"/>
      <path d="m52 72 4 8m72-14 5-4" stroke="#fff" opacity=".6" strokeWidth="3"/>
    </g>
    <circle cx="35" cy="115" r="3" fill="#493650" opacity=".4"/>
  </svg>;
}
