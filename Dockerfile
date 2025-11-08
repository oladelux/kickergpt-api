FROM node:20.17.0-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN touch /usr/local/bin/husky && chmod +x /usr/local/bin/husky

RUN npm install --include=dev --no-audit

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
