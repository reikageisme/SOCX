import requests

def test_endpoints():
    base_url = "http://localhost:8000"
    
    # 1. Public routes (Should return 200)
    public_routes = [
        "/api/v1/health",
        "/api/v1/login/access-token"
    ]
    
    # 2. Protected routes (Should return 401 Unauthorized without token)
    protected_routes = [
        "/api/v1/proxmox/nodes",
        "/api/v1/system/dashboard-metrics",
        "/api/v1/users/me",
        "/api/v1/assets",
        "/api/v1/system/data-sources/status",
        "/api/v1/rules",
        "/api/v1/logs",
        "/api/v1/settings",
        "/api/v1/incidents",
        "/api/v1/intel/lookup?q=1.1.1.1",
        "/api/v1/reports/executive",
        "/api/v1/events/history",
        "/api/v1/events/stats"
    ]
    
    print("Running Auth Audit...")
    
    for route in public_routes:
        if route == "/api/v1/login/access-token":
            res = requests.post(base_url + route, data={"username": "test", "password": "abc"})
            # It should return 400 or 401 but not because of missing token, but because of incorrect credentials. 
            # 400 is fine here. Wait, our auth.py raises 400 if wrong.
            status = res.status_code
            if status not in [200, 400]:
                print(f"[FAIL] Public route {route} returned {status}")
            else:
                print(f"[PASS] Public route {route} (returned {status})")
        else:
            res = requests.get(base_url + route)
            if res.status_code == 200:
                print(f"[PASS] Public route {route} (returned 200)")
            else:
                print(f"[FAIL] Public route {route} returned {res.status_code}")

    for route in protected_routes:
        try:
            res = requests.get(base_url + route)
            if res.status_code == 401:
                print(f"[PASS] Protected route {route} correctly returned 401")
            else:
                print(f"[FAIL] Protected route {route} returned {res.status_code} instead of 401!")
        except Exception as e:
            print(f"[FAIL] Connection error on {route}: {e}")

if __name__ == "__main__":
    test_endpoints()
