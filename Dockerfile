FROM node:8

MAINTAINER Holger Stitz <holger.stitz@jku.at>

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install --only=production
# If you are building your code for production
# RUN npm install --only=production

# Bundle app source
COPY . .

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000
CMD [ "npm", "start" ]
