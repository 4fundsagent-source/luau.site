-- luau.site Lab corpus: control-flow
-- Structured control flow that a devirtualizer has to rebuild from a dispatcher.

local function classify(n: number): string
	if n % 15 == 0 then
		return "FizzBuzz"
	elseif n % 3 == 0 then
		return "Fizz"
	elseif n % 5 == 0 then
		return "Buzz"
	end
	return tostring(n)
end

local line = {}
for i = 1, 15 do
	table.insert(line, classify(i))
end
print(table.concat(line, " "))

-- continue + break inside nested loops
local pairsFound = 0
for a = 1, 6 do
	for b = a, 6 do
		if (a + b) % 2 == 1 then
			continue
		end
		if a * b > 20 then
			break
		end
		pairsFound += 1
	end
end
print("even-sum pairs:", pairsFound)

-- while with an early exit
local collatz, steps = 27, 0
while collatz ~= 1 do
	collatz = if collatz % 2 == 0 then collatz // 2 else 3 * collatz + 1
	steps += 1
	if steps > 500 then
		break
	end
end
print("collatz(27) steps:", steps)

-- repeat-until with a local visible in the condition
local total = 0
repeat
	local nextValue = total + 7
	total = nextValue
until nextValue >= 50
print("repeat total:", total)

-- a tiny state machine
local transitions = {
	idle = { start = "running" },
	running = { pause = "paused", stop = "idle" },
	paused = { resume = "running", stop = "idle" },
}
local state = "idle"
local trace = { state }
for _, event in { "start", "pause", "resume", "stop", "pause" } do
	local nextState = transitions[state][event]
	if nextState then
		state = nextState
		table.insert(trace, state)
	end
end
print("states:", table.concat(trace, " -> "))
