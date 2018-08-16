# ThermalPlot

ThermalPlot is a technique to visualize multi-attribute time-series data using a thermal metaphor.

![ThermalPlot screenshot](http://thermalplot.pipes-vs-dams.at/images/card_image.png)


## Installation

1. Install [Git Large File Storage](https://git-lfs.github.com/) *before* cloning this repository
2. `git clone https://github.com/thinkh/thermalplot.git`
3. `npm install`


## Run ThermalPlot

Open your terminal or command line and run `npm start`.


## Docker image

### Build Docker image

1. Clone this repository
2. Open your terminal or command line
3. Create frontend build: `npm run build`
3. Run `docker build -t thermalplot:latest .`

### Run Docker image

1. Open your terminal or command line
2. Run `docker run -d --rm -p 80:3000 --name tpc thermalplot`
4. Open a web browser and go to http://localhost

### Stop Docker image

1. Switch to the terminal or command line
3. Run `docker stop tpc`

