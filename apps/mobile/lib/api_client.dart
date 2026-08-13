import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiClient {
  // Android emulator uses 10.0.2.2 for host loopback.
  static const defaultBaseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:3001/api',
  );

  String baseUrl;
  String? token;

  ApiClient({this.baseUrl = defaultBaseUrl});

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: _headers,
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (res.statusCode >= 400) {
      throw Exception(jsonDecode(res.body)['message'] ?? 'Login failed');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    token = data['accessToken'] as String?;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('accessToken', data['accessToken']);
    await prefs.setString('refreshToken', data['refreshToken']);
    await prefs.setString('user', jsonEncode(data['user']));
    return data;
  }

  Future<Map<String, dynamic>> me() async {
    return getJson('/auth/me');
  }

  Future<Map<String, dynamic>> getJson(String path) async {
    final res = await http.get(Uri.parse('$baseUrl$path'), headers: _headers);
    if (res.statusCode >= 400) {
      throw Exception('Request failed: ${res.statusCode}');
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<List<dynamic>> getList(String path) async {
    final res = await http.get(Uri.parse('$baseUrl$path'), headers: _headers);
    if (res.statusCode >= 400) {
      throw Exception('Request failed: ${res.statusCode}');
    }
    return jsonDecode(res.body) as List<dynamic>;
  }

  Future<dynamic> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final res = await http.post(
      Uri.parse('$baseUrl$path'),
      headers: _headers,
      body: jsonEncode(body),
    );
    if (res.statusCode >= 400) {
      try {
        final err = jsonDecode(res.body);
        final msg = err is Map ? err['message'] : null;
        throw Exception(msg ?? 'Request failed: ${res.statusCode}');
      } catch (e) {
        if (e is Exception) rethrow;
        throw Exception('Request failed: ${res.statusCode}');
      }
    }
    if (res.body.isEmpty) return null;
    return jsonDecode(res.body);
  }
}
