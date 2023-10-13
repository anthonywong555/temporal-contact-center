FROM node:latest AS build

WORKDIR /usr/src/app/worker

COPY . .

RUN npm install

RUN npm install -g typescript ts-node

RUN npm run build

RUN npm run build:workflow

FROM node:18-bullseye

ENV NODE_ENV production

WORKDIR /usr/src/app/worker

COPY package.json .

COPY tsconfig.json .

RUN npm install --omit=dev

COPY --from=build /usr/src/app/worker dist

WORKDIR /usr/src/app/worker/dist

CMD ["node", "lib/worker.js"]

EXPOSE 9464