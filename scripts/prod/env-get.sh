#!/bin/sh
# The ONE parser for .env.prod values (used by the Makefile, the scripts and, through the same rules, compose).
# Usage: env-get.sh <file> <KEY> [default]
# Last assignment wins; carriage returns, surrounding spaces and one pair of quotes are removed; the file is never executed.
file="$1"; key="$2"; def="${3:-}"
v=$([ -r "$file" ] && tr -d '\r' < "$file" 2>/dev/null \
  | sed -n "s/^[[:space:]]*$key[[:space:]]*=[[:space:]]*//p" | tail -n 1 \
  | sed -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/")
if [ -n "$v" ]; then printf '%s' "$v"; else printf '%s' "$def"; fi
