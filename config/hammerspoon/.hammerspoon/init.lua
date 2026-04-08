local spaces = require("hs.spaces")
local screen = require("hs.screen")
local window = require("hs.window")

local function createNewSpace()
    local currentScreen = screen.mainScreen()
    local screenUUID = currentScreen:getUUID()
    spaces.addSpaceToScreen(screenUUID)
end

local function getCurrentSpaceId()
    local currentSpace = spaces.activeSpaceOnScreen()
    return currentSpace
end

local function isCurrentSpaceEmpty()
    local currentSpace = getCurrentSpaceId() 
    local visibleWindows = window.visibleWindows()
    
    for _, win in ipairs(visibleWindows) do
        if spaces.windowSpaces(win)[1] == currentSpace then
            return false
        end
    end
    
    return true
end

local function closeEmptySpace()
    if isCurrentSpaceEmpty() then
        local allSpaces = spaces.allSpaces()
        local currentSpace = getCurrentSpaceId()
        local currentScreen = screen.mainScreen()
        
        -- 找到當前屏幕上的其他 space
        local otherSpaces = allSpaces[currentScreen:getUUID()]
        
        -- 如果有其他 space，切換到第一個不是當前 space 的 space
        for _, spaceID in ipairs(otherSpaces) do
            if spaceID ~= currentSpace then
                spaces.gotoSpace(spaceID)
                spaces.closeMissionControl()
                -- 等待切換完成
                hs.timer.usleep(500000)
                -- 關閉之前的空 space
                spaces.removeSpace(currentSpace)
                break
            end
        end
    end
end

hs.hotkey.bind({"cmd", "ctrl"}, "N", createNewSpace)
hs.hotkey.bind({"cmd", "ctrl"}, "D", closeEmptySpace)
