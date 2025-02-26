FROM nginx:alpine

COPY . /usr/share/nginx/html/

RUN echo 'server { \
    listen 3001; \
    location /weather-radar { \
        root /usr/share/nginx/html; \
        index index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf
