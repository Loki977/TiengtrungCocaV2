/*
Biên dịch:
  Windows MinGW: gcc validate_exam.c -o validate_exam.exe
  Linux/macOS:   cc validate_exam.c -o validate_exam

Công cụ này kiểm tra nhanh các trường bắt buộc bằng cách đọc văn bản JSON.
Đây không phải JSON parser đầy đủ; trình biên tập HTML và data-loader.js mới là bộ kiểm tra chính.
*/
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char *read_all(const char *path) {
    FILE *file = fopen(path, "rb");
    long size;
    char *buffer;

    if (!file) return NULL;
    fseek(file, 0, SEEK_END);
    size = ftell(file);
    rewind(file);

    buffer = (char *)malloc((size_t)size + 1);
    if (!buffer) {
        fclose(file);
        return NULL;
    }

    if (fread(buffer, 1, (size_t)size, file) != (size_t)size) {
        free(buffer);
        fclose(file);
        return NULL;
    }

    buffer[size] = '\0';
    fclose(file);
    return buffer;
}

static int require_token(const char *json, const char *token) {
    if (strstr(json, token)) {
        printf("[OK] %s\n", token);
        return 0;
    }
    printf("[LOI] Thieu %s\n", token);
    return 1;
}

int main(int argc, char **argv) {
    char *json;
    int errors = 0;

    if (argc != 2) {
        fprintf(stderr, "Dung: %s duong-dan-file.json\n", argv[0]);
        return 2;
    }

    json = read_all(argv[1]);
    if (!json) {
        fprintf(stderr, "Khong doc duoc file: %s\n", argv[1]);
        return 2;
    }

    errors += require_token(json, "\"id\"");
    errors += require_token(json, "\"title\"");
    errors += require_token(json, "\"durationMinutes\"");
    errors += require_token(json, "\"sections\"");
    errors += require_token(json, "\"questions\"");
    errors += require_token(json, "\"answer\"");

    free(json);

    if (errors) {
        printf("Khong dat: %d muc bi thieu.\n", errors);
        return 1;
    }

    printf("Dat kiem tra nhanh.\n");
    return 0;
}
