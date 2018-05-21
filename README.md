# ThermalPlot

ThermalPlot is a technique to visualize multi-attribute time-series data using a thermal metaphor.

![ThermalPlot screenshot](http://thermalplot.pipes-vs-dams.at/images/card_image.png)


## Prerequisites

Install and run [Docker](https://docker.com/).


## Build Docker image

1. Clone this repository
2. Open your terminal or command line
3. Run `docker build -t thermalplot:latest .`
4. Wait until the initial build has finished (this might take around 30-40 minutes)

**Troubleshooting**

In case the provision.sh is not starting, open the file in your editor and change the end of line sequence for this file from *CRLF* to *LF* (i.e., from Windows to Linux). Save the file and restart the build process again.


## Run ThermalPlot

1. Open your terminal or command line
2. Run `docker run -d --rm -p 80:8888 --name tpc thermalplot`
3. The setup will switch to the server directory and start the server automatically
4. Open a web browser and go to http://localhost


## Stop ThermalPlot

1. Switch to the terminal or command line
3. Run `docker stop tpc`


## Update finance datasets

The fincance dataset is importing data of the [FTSE 250](http://www.londonstockexchange.com/exchange/prices-and-markets/stocks/indices/summary/summary-indices.html?index=MCX) and [S&P 500](http://www.spindices.com/indices/equity/sp-500) indices.

1. [Run ThermalPlot](#run-thermalplot)
2. Run `docker exec -t tpc /bin/sh update_financial_data.sh`
