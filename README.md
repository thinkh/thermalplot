# ThermalPlot

ThermalPlot is a technique to visualize multi-attribute time-series data using a thermal metaphor.

![ThermalPlot screenshot](http://thermalplot.pipes-vs-dams.at/images/card_image.png)


## Prerequisites

Install and run [Docker](https://docker.com/).


## Build Docker image

1. Clone this repository
2. Open your terminal or command line
3. Run `docker build -t thermalplot:latest .`
4. Wait until the initial build has finished (this might take up to 30 minutes)


## Run ThermalPlot

1. Open your terminal or command line
2. Run `docker run -d --rm -p 80:8888 --name tpc thermalplot`
3. The setup will switch to the server directory and start the server automatically
4. Open a web browser and go to http://localhost


## Stop ThermalPlot

1. Switch to the terminal or command line
3. Run `docker stop tpc`


## Update default finance datasets

The fincance dataset is importing data of the [FTSE 250](http://www.londonstockexchange.com/exchange/prices-and-markets/stocks/indices/summary/summary-indices.html?index=MCX) and [S&P 500](http://www.spindices.com/indices/equity/sp-500) indices.

1. Run ThermalPlot
2. Run `docker exec -t tpc /bin/sh update_financial_data.sh`
