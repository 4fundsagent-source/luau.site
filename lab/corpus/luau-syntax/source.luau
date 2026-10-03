-- luau.site Lab corpus: luau-syntax
-- Luau-only features. Obfuscators without real Luau support fail to parse this.

type Item = { name: string, price: number, tags: { string }? }

local inventory: { Item } = {
	{ name = "sword", price = 120, tags = { "weapon", "melee" } },
	{ name = "potion", price = 15 },
	{ name = "bow", price = 95, tags = { "weapon", "ranged" } },
}

local total = 0
for _, item in inventory do
	total += item.price
end
print(`total value: {total}`)

for index, item in inventory do
	local kind = if item.tags then item.tags[1] else "consumable"
	print(`{index}. {item.name} ({kind}) costs {item.price // 1} gold`)
end

local function discount(price: number, percent: number?): number
	local p = percent or 10
	return price - price * p / 100
end
print(`discounted: {discount(200)} / {discount(200, 25)}`)

local frozen = table.freeze({ a = 1 })
local wrote = pcall(function()
	(frozen :: any).a = 2
end)
print("frozen:", table.isfrozen(frozen), "write allowed:", wrote)

local found = table.find({ "x", "y", "z" }, "z")
local cloned = table.clone(inventory[2])
cloned.price *= 2
print("find/clone:", found, cloned.price, inventory[2].price)

local b = buffer.create(8)
buffer.writeu32(b, 0, 0xDEADBEEF)
buffer.writef32(b, 4, 1.5)
print(string.format("buffer: %X %.1f", buffer.readu32(b, 0), buffer.readf32(b, 4)))

local s = "a,b,,c"
print("split:", #s:split(","), table.concat(s:split(","), "|"))
