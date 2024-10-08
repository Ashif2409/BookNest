FROM node:20

WORKDIR /src

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8000

CMD [ "npm","start" ]