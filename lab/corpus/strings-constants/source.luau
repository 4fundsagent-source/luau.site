-- luau.site Lab corpus: strings-constants
-- Constant encryption must round-trip every one of these exactly.

local escaped = "tab:\tquote:\"\\ newline-escape:\\n bell-free"
print(escaped)

local long = [[
line one
  line two, indented
]]
print(#long, (long:gsub("\n", "|")))

print(string.format("%5.2f|%-6s|%03d|%x|%q", math.pi, "pad", 7, 255, "q\"uote"))

local bytes = { string.byte("Luau", 1, -1) }
print("bytes:", table.concat(bytes, ","), string.char(table.unpack(bytes)))

local words = {}
for word in ("the quick brown fox jumps"):gmatch("%a+") do
	table.insert(words, word:upper())
end
print(table.concat(words, "_"))

print("reverse:", ("obfuscation"):reverse(), ("abc"):rep(3))

-- numeric constants and edge cases
print(0x7FFFFFFF, 1e3, 2 ^ 53, -0.5, 10 // 3, -7 % 3, 7 / 2)
print(math.huge, -math.huge, math.huge ~= math.huge)
print(math.floor(-3.5), math.ceil(-3.5), math.abs(-12), math.max(3, 9, 4))
print(tostring(nil), tostring(true), tonumber("0x10"), tonumber("12.5e1"))
