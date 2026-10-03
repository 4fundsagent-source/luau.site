-- luau.site Lab corpus: closures-upvalues
-- Upvalue capture and sharing is where many VM lifters go wrong.

local function counter(start: number)
	local n = start
	return function()
		n += 1
		return n
	end, function()
		return n
	end
end

local inc, peek = counter(10)
inc()
inc()
print("counter:", inc(), peek())

-- closures created in a loop capture a fresh local each iteration
local fns = {}
for i = 1, 3 do
	fns[i] = function()
		return i * i
	end
end
print("loop captures:", fns[1](), fns[2](), fns[3]())

-- two closures sharing one upvalue
local function account(balance: number)
	local function deposit(x: number)
		balance += x
	end
	local function read()
		return balance
	end
	return deposit, read
end
local deposit, read = account(100)
deposit(25)
deposit(-40)
print("shared upvalue:", read())

-- recursion and memoization
local memo = {}
local function fib(n: number): number
	if n < 2 then
		return n
	end
	if memo[n] then
		return memo[n]
	end
	local v = fib(n - 1) + fib(n - 2)
	memo[n] = v
	return v
end
print("fib(40):", fib(40))

-- varargs
local function stats(...: number)
	local count = select("#", ...)
	local sum = 0
	for _, v in { ... } do
		sum += v
	end
	return count, sum
end
print("varargs:", stats(4, 8, 15, 16, 23, 42))

-- higher-order composition
local function compose(...)
	local fs = { ... }
	return function(x)
		for i = #fs, 1, -1 do
			x = fs[i](x)
		end
		return x
	end
end
local pipeline = compose(function(x)
	return x + 1
end, function(x)
	return x * 2
end)
print("compose:", pipeline(5))
