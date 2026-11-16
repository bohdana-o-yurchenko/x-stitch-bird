import json, re, sys
cat_path, raw_path, col_path = sys.argv[1:4]
cat = json.load(open(cat_path)); raw = json.load(open(raw_path)); col = json.load(open(col_path))
# beads per package, from Mill Hill's Glass Bead Inventory (update 2010)
PACK = {"Glass Seed": 500, "Crayon Seed": 500, "Petite Glass": 500, "Antique Glass": 250, "Frosted Glass": 500,
        "Magnifica": 400, "Size 8": 275, "Size 6": 100, "Pebble": 30, "Small Bugle": 135, "Medium Bugle": 75, "Large Bugle": 40}
# Glass Seed exceptions marked in the inventory: "+" 250 per package, "≈" about 450
PLUS = "00206 00221 00330 02012 02035 02036 02041 02044 02045 02047 02051 02053 02071 02075 02083 02084 02087 02098".split()
APPROX = ("02033 02034 02037 02038 02039 02040 02042 02043 02046 02048 02049 02050 02052 02054 02055 02056 02057 02070 02072 02073 "
          "02074 02076 02077 02078 02079 02080 02081 02082 02085 02086 02088 02089 02090 02091 02092 02093 02094 02095 02096 02097 "
          "02099 02103 02104 02105").split()
# in the inventory or the 2015 conversion chart, missing here (Potpourri is a mix: no DMC equivalent)
ADD = {"Glass Seed": [["00777", "Potpourri", ""], ["02101", "Purple", "327"]], "Crayon Seed": [["02062", "Crayon Light Crimson", "666"]],
       "Petite Glass": [["40777", "Potpourri", ""]], "Small Bugle": [["70777", "Potpourri", ""]], "Medium Bugle": [["80777", "Potpourri", ""]]}
FIX_DMC = {"42101": "327"}  # 2015 conversion chart
out = []
for s in cat:
    name = s["series"]
    beads = {b[0]: [b[0], b[1], FIX_DMC.get(b[0], b[2])] for b in s["beads"]}
    for b in ADD.get(name, []): beads.setdefault(b[0], b)
    rows = []
    for code in sorted(beads):
        b = beads[code]
        if name == "Glass Seed" and code in PLUS: b = b + [250]
        elif name == "Glass Seed" and code in APPROX: b = b + [450]
        rows.append(b)
    out.append({"series": name, "pack": PACK[name], "beads": rows})
# Treasures, from Wichelt's catalogue: name, size, pieces per package; colour read off the product photo
def pieces(t):
    for f in (t["pcs"], t["size"]):
        m = re.match(r"^(\d+)\s*pcs?\.?$", f)
        if m: return int(m.group(1))
    return int(t["pcs"]) if t["pcs"].isdigit() else 1
def size(t):
    return "" if re.match(r"^\d+\s*pcs?\.?$", t["size"]) else t["size"].replace(" ", "")
def clean(n):
    n = re.split(r"\s+Substitute for", n)[0].strip().rstrip(".")
    return re.sub(r"\s+", " ", n)
for series in ("Glass Treasures", "Crystal Treasures", "Metal Treasures"):
    rows = []
    for t in raw:
        if t["type"] != series: continue
        sz = size(t); c = col.get(t["code"])
        nm = clean(t["name"]) + (f", {sz}" if sz and sz not in t["name"] else "")
        rows.append([t["code"], nm, "", pieces(t), "#" + c["avg"] if c else "#B0B0B0"])
    out.append({"series": series, "pack": 1, "beads": rows})
json.dump(out, open(cat_path, "w"), ensure_ascii=False, separators=(",", ":"))
print({s["series"]: (len(s["beads"]), s["pack"]) for s in out})
