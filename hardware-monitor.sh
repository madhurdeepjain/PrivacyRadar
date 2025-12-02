#!/bin/bash
# Cross-distribution Linux Hardware Monitoring Script - Security audit of hardware resource access
set -euo pipefail
RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m' BLUE='\033[0;34m' NC='\033[0m'
QUICK_SCAN=false VERBOSE=false SUMMARY=() APPS=()
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO_NAME="${NAME:-$ID}" DISTRO_ID="$ID" DISTRO_VERSION="${VERSION_ID:-}"
        case "$ID" in
            ubuntu|debian|raspbian) DISTRO_FAMILY="Debian" ;;
            rhel|centos|fedora|rocky|almalinux|ol) DISTRO_FAMILY="Red Hat" ;;
            arch|manjaro|endeavouros|garuda) DISTRO_FAMILY="Arch" ;;
            opensuse*|sles) DISTRO_FAMILY="SUSE" ;;
            gentoo) DISTRO_FAMILY="Gentoo" ;;
            *) DISTRO_FAMILY="Other" ;;
        esac
    elif [ -f /etc/redhat-release ]; then
        DISTRO_NAME=$(head -1 /etc/redhat-release) DISTRO_FAMILY="Red Hat"
    elif [ -f /etc/arch-release ]; then
        DISTRO_NAME="Arch Linux" DISTRO_FAMILY="Arch"
    elif [ -f /etc/debian_version ]; then
        DISTRO_NAME="Debian $(cat /etc/debian_version)" DISTRO_FAMILY="Debian"
    else
        DISTRO_NAME="Unknown" DISTRO_FAMILY="Unknown"
    fi
    echo -e "${BLUE}=== Distribution Information ===${NC}\nName: $DISTRO_NAME | Family: $DISTRO_FAMILY${DISTRO_VERSION:+ | Version: $DISTRO_VERSION}\n"
}
check_device() {
    local dev=$1 name=$2
    [ ! -e "$dev" ] && { [ "$VERBOSE" = true ] && echo -e "${YELLOW}⊘ Device not found: $dev${NC}"; return 1; }
    command -v lsof >/dev/null 2>&1 || { [ "$VERBOSE" = true ] && echo -e "${YELLOW}⚠ lsof not available${NC}"; return 1; }
    local procs=$(lsof "$dev" 2>/dev/null | tail -n +2) app
    [ -z "$procs" ] && { [ "$VERBOSE" = true ] && echo -e "${GREEN}✓ Available: $dev (not in use)${NC}"; return 1; }
    echo -e "${RED}⚠ ACTIVE: $dev${NC}"
    echo "$procs" | awk '{print "  → PID:", $2, "| Process:", $1, "| User:", $3}' | head -5
    app=$(echo "$procs" | awk 'NR==1 {print $1}' | head -1)
    SUMMARY+=("$name: $dev (ACTIVE)") && APPS+=("$app")
    return 0
}
check_camera() {
    echo -e "${BLUE}=== Camera Devices ===${NC}"
    local active=false dev found=false
    for dev in /dev/video*; do [ -e "$dev" ] 2>/dev/null && { found=true; check_device "$dev" "Camera" && active=true; } done
    [ "$found" = false ] && [ "$VERBOSE" = true ] && echo -e "${YELLOW}⊘ No camera devices found${NC}"
    [ "$active" = false ] && [ "$found" = true ] && echo -e "${GREEN}✓ No active camera usage${NC}\n"
}
check_microphone() {
    echo -e "${BLUE}=== Microphone / Audio Input ===${NC}"
    local active=false dev app
    for dev in /dev/snd/*; do [ -e "$dev" ] 2>/dev/null && check_device "$dev" "Audio" && active=true; done
    if command -v pactl >/dev/null 2>&1; then
        local pa_output=$(pactl list source-outputs 2>/dev/null | grep -A 10 "Source Output" || true)
        [ -n "$pa_output" ] && echo "$pa_output" | grep -q "Source Output" && {
            active=true && echo -e "${RED}⚠ ACTIVE: PulseAudio recording${NC}"
            echo "$pa_output" | grep -E "(Source Output|application\.name|application\.process\.binary)" | sed 's/^/  → /' | head -6
            app=$(echo "$pa_output" | grep "application\.process\.binary" | head -1 | sed 's/.*= "\(.*\)"/\1/' || echo "Unknown")
            SUMMARY+=("Microphone: PulseAudio (ACTIVE)") && APPS+=("$app")
        }
    fi
    if command -v pw-top >/dev/null 2>&1; then
        local pw_rec=$(timeout 2 pw-top -l 1 2>/dev/null | grep -iE "recording|capture" || true)
        [ -n "$pw_rec" ] && {
            active=true && echo -e "${RED}⚠ ACTIVE: PipeWire recording${NC}"
            echo "$pw_rec" | sed 's/^/  → /' | head -3 && SUMMARY+=("Microphone: PipeWire (ACTIVE)") && APPS+=("PipeWire")
        }
    fi
    [ "$active" = false ] && echo -e "${GREEN}✓ No active microphone usage${NC}\n"
}
check_screen_capture() {
    echo -e "${BLUE}=== Screen Capture ===${NC}"
    local active=false app
    if [ -n "${WAYLAND_DISPLAY:-}" ] || [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
        echo "Display Server: Wayland"
        command -v lsof >/dev/null 2>&1 && {
            local wayland_procs=$(lsof /tmp/wayland-* 2>/dev/null | grep -E "(screencopy|pipewire)" || true)
            [ -n "$wayland_procs" ] && {
                active=true && echo -e "${RED}⚠ ACTIVE: Screen capture (Wayland)${NC}"
                echo "$wayland_procs" | awk '{print "  → PID:", $2, "| Process:", $1}' | head -3
                app=$(echo "$wayland_procs" | awk 'NR==1 {print $1}' | head -1)
                SUMMARY+=("Screen: Wayland capture (ACTIVE)") && APPS+=("$app")
            }
        }
    elif [ -n "${DISPLAY:-}" ]; then
        echo "Display Server: X11"
        local x11_capture=$(ps aux 2>/dev/null | grep -E "(ffmpeg|obs|kazam|simplescreenrecorder|recordmydesktop|gnome-screenshot|flameshot)" | grep -v grep || true)
        [ -n "$x11_capture" ] && {
            active=true && echo -e "${RED}⚠ ACTIVE: Screen capture tools${NC}"
            echo "$x11_capture" | awk '{print "  → PID:", $2, "| Process:", $11}' | head -3
            app=$(echo "$x11_capture" | awk 'NR==1 {print $11}' | head -1)
            SUMMARY+=("Screen: X11 capture (ACTIVE)") && APPS+=("$app")
        }
    else
        echo "Display Server: Unknown/Headless"
    fi
    [ "$active" = false ] && echo -e "${GREEN}✓ No active screen capture${NC}\n"
}
check_gpu() {
    echo -e "${BLUE}=== GPU Devices ===${NC}"
    local active=false dev found=false
    for dev in /dev/dri/*; do [ -e "$dev" ] 2>/dev/null && { found=true; check_device "$dev" "GPU" && active=true; } done
    [ "$found" = false ] && [ "$VERBOSE" = true ] && echo -e "${YELLOW}⊘ No GPU devices found${NC}"
    [ "$active" = false ] && [ "$found" = true ] && echo -e "${GREEN}✓ No active GPU usage${NC}\n"
}
check_network() {
    echo -e "${BLUE}=== Network Connections ===${NC}"
    local active=false conns
    command -v ss >/dev/null 2>&1 && conns=$(ss -tunp 2>/dev/null | tail -n +2 | head -10)
    [ -z "${conns:-}" ] && command -v netstat >/dev/null 2>&1 && conns=$(netstat -tunp 2>/dev/null | tail -n +2 | head -10)
    [ -n "${conns:-}" ] && {
        active=true && echo -e "${YELLOW}⚠ Active connections (showing first 10):${NC}"
        echo "$conns" | awk '{print "  →", $0}' | head -10 && SUMMARY+=("Network: Active connections")
    } || { [ "$VERBOSE" = true ] && echo -e "${YELLOW}⚠ Network tools not available${NC}"; }
    [ "$active" = false ] && echo -e "${GREEN}✓ No active network connections${NC}\n"
}
check_storage() {
    [ "$QUICK_SCAN" = true ] && echo -e "${BLUE}=== Storage Access ===${NC}${GREEN}✓ Skipped in quick scan${NC}\n" && return
    echo -e "${BLUE}=== Storage / Filesystem Access ===${NC}"
    local active=false dir procs
    command -v lsof >/dev/null 2>&1 && for dir in /home /root /etc /var/log; do
        [ -d "$dir" ] && procs=$(lsof +D "$dir" 2>/dev/null | tail -n +2 | head -3)
        [ -n "${procs:-}" ] && {
            active=true && echo -e "${YELLOW}⚠ Access to $dir:${NC}"
            echo "$procs" | awk '{print "  → PID:", $2, "| Process:", $1}' | head -2
        }
    done
    [ "$active" = false ] && echo -e "${GREEN}✓ No unusual filesystem access${NC}\n"
}
print_summary() {
    echo -e "${BLUE}=== Summary ===${NC}"
    [ ${#SUMMARY[@]} -eq 0 ] && echo -e "${GREEN}✓ No active hardware access detected${NC}\n" || {
        echo -e "${RED}⚠ Active Hardware Access Detected:${NC}"
        for item in "${SUMMARY[@]}"; do
            [[ "$item" == *"ACTIVE"* ]] && echo -e "${RED}  ⚠ $item${NC}" || echo -e "${GREEN}  ✓ $item${NC}"
        done
        [ ${#APPS[@]} -gt 0 ] && echo -e "\n${YELLOW}Applications accessing hardware:${NC}" && printf '%s\n' "${APPS[@]}" | sort -u | sed 's/^/  → /'
        echo
    }
}
usage() { echo "Usage: $0 [OPTIONS]"; echo "  -q, --quick    Quick scan (skip storage check)"; echo "  -v, --verbose  Verbose output (show all checks)"; echo "  -h, --help     Show this help message"; exit 0; }
while [[ $# -gt 0 ]]; do
    case $1 in
        -q|--quick) QUICK_SCAN=true; shift ;;
        -v|--verbose) VERBOSE=true; shift ;;
        -h|--help) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done
detect_distro && check_camera && check_microphone && check_screen_capture && check_gpu && check_network && check_storage && print_summary
