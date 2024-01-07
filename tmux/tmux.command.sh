#!/bin/bash

function startup_tmux_session() {
    SESSION_NAME="develop"
    WINDOW_NAME="ide"

    # Check to see if we're already running the session
    tmux has-session -t $SESSION_NAME &> /dev/null

    if [ $? != 0 ] ; then
        # Create tmux session with name and assign window name
        tmux new-session -d -s $SESSION_NAME -n $WINDOW_NAME > /dev/null
        tmux send-keys "neofetch" C-m
        tmux split-window -v -l 20
        tmux select-pane -t 1
    else
        echo "tmux session already running, attaching..."
        sleep 2
    fi

    tmux attach
}

alias sts='startup_tmux_session'
