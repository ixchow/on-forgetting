.PHONY: all

OS := $(shell uname)

ifeq ($(OS), Linux)
	INKSCAPE=inkscape
else
	INKSCAPE=/Applications/Inkscape.app/Contents/Resources/bin/inkscape
endif

all : \
	tiles.png \


tiles.png : tiles.svg
	$(INKSCAPE) --without-gui --file='$<' --export-area-page --export-background=white --export-background-opacity=0 --export-png='$@' --export-width=1024


