CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    usdt_to_etb_rate DECIMAL(10, 2) DEFAULT 125.00,
    fixed_markup_etb DECIMAL(10, 2) DEFAULT 2000.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_settings (usdt_to_etb_rate, fixed_markup_etb) 
VALUES (125.00, 2000.00)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS flight_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passenger_name VARCHAR(100) NOT NULL,
    ethiopian_date VARCHAR(20) NOT NULL,
    gregorian_date DATE NOT NULL,
    route_type VARCHAR(50) DEFAULT 'MULTI_CITY_STOPOVER',
    origin VARCHAR(10) NOT NULL,
    destination VARCHAR(10) NOT NULL,
    stopover_city VARCHAR(10) DEFAULT 'DXB',
    stopover_days INT DEFAULT 3,
    include_visa BOOLEAN DEFAULT TRUE,
    include_hotel BOOLEAN DEFAULT TRUE,
    
    net_fare_1to1_usdt DECIMAL(10, 2) NOT NULL,
    net_fare_1to2_usdt DECIMAL(10, 2) NOT NULL,
    hotel_net_usdt DECIMAL(10, 2) DEFAULT 0.00,
    visa_net_usdt DECIMAL(10, 2) DEFAULT 0.00,
    
    approved_price_1to2_etb DECIMAL(10, 2) DEFAULT NULL,
    status VARCHAR(50) DEFAULT 'WAITING_ADMIN_APPROVAL',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
