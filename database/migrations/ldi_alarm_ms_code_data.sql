"insert_sql"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01010001', 'A', '01010001', 'protocol is empty', 'protocol is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01010002', 'A', '01010002', 'ART_AD module communication abnormality', 'ART_AD module communication abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01010003', 'A', '01010003', 'Connection failed', 'Connection failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01010004', 'A', '01010004', 'Read channel data abnormality', 'Read channel data abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01020001', 'A', '01020001', 'AutoFocus initialization failed', 'AutoFocus initialization failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01020002', 'A', '01020002', 'Connection failed', 'Connection failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01020003', 'A', '01020003', 'AutoFocusMotor operation failed', 'AutoFocusMotor operation failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01020004', 'A', '01020004', 'Reset failed', 'Reset failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01020005', 'A', '01020005', 'Loading parameter error', 'Loading parameter error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030001', 'A', '01030001', 'Automatic line communication protocol error', 'Automatic line communication protocol error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030002', 'A', '01030002', 'Loading board error', 'Loading board error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030003', 'A', '01030003', 'Error in lower OK board', 'Error in lower OK board')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030004', 'A', '01030004', 'Error in lower NG board', 'Error in lower NG board')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030005', 'A', '01030005', 'Setting board size abnormality', 'Setting board size abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030006', 'A', '01030006', 'Automatic line sticky roller rising error', 'Automatic line sticky roller rising error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030007', 'A', '01030007', 'Automatic line communication timeout', 'Automatic line communication timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030008', 'A', '01030008', 'Stop the automatic line abnormality', 'Stop the automatic line abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030009', 'A', '01030009', 'Abnormal sending stage position', 'Abnormal sending stage position')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0103000A', 'A', '0103000A', 'Get the automatic line arm safety position abnormality', 'Get the automatic line arm safety position abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0103000B', 'A', '0103000B', 'Interface not implemented', 'Interface not implemented')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0103000C', 'A', '0103000C', 'Failed to connect to the automatic line', 'Failed to connect to the automatic line')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0103000D', 'A', '0103000D', 'Failed to disconnect the automatic line', 'Failed to disconnect the automatic line')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0103000E', 'A', '0103000E', 'Automatic line communication error', 'Automatic line communication error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0103000F', 'A', '0103000F', 'Automatic line reading operation error', 'Automatic line reading operation error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030010', 'A', '01030010', 'Automatic line writing operation error', 'Automatic line writing operation error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030011', 'A', '01030011', 'Automatic line cannot run', 'Automatic line cannot run')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030012', 'A', '01030012', 'Failed  sending QR code information to automatic line', 'Failed  sending QR code information to automatic line')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030013', 'A', '01030013', 'This status is not supported currently', 'This status is not supported currently')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030014', 'A', '01030014', 'Board height and width conversion error', 'Board height and width conversion error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030015', 'A', '01030015', 'Prepare loading board timeout', 'Prepare loading board timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030016', 'A', '01030016', 'The request to prepare for board unloading has timed out.', 'The request to prepare for board unloading has timed out.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030017', 'A', '01030017', 'Timeout without receiving uploading board information', 'Timeout without receiving uploading board information')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030018', 'A', '01030018', 'Received uploading board failure message', 'Received uploading board failure message')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030019', 'A', '01030019', 'Start automatic line timeout', 'Start automatic line timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0103001A', 'A', '0103001A', 'Automatic line zeroing timeout', 'Automatic line zeroing timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0103001B', 'A', '0103001B', 'Reset automatic line timeout', 'Reset automatic line timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0103001C', 'A', '0103001C', 'Robot zero return timeout', 'Robot zero return timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0103001D', 'A', '0103001D', 'Automatic line communication clear timeout', 'Automatic line communication clear timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0103001E', 'A', '0103001E', 'Error in getting automatic line status', 'Error in getting automatic line status')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01030020', 'A', '01030020', 'Timeout in sending clear board signal', 'Timeout in sending clear board signal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01040001', 'A', '01040001', 'Scanning camera not found', 'Scanning camera not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01040002', 'A', '01040002', 'Scanning camera disconnected', 'Scanning camera disconnected')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01040003', 'A', '01040003', 'Failed to delete the QR code information', 'Failed to delete the QR code information')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01040004', 'A', '01040004', 'Scanning camera server failed to start', 'Scanning camera server failed to start')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060001', 'A', '01060001', 'BGCamera system not found', 'BGCamera system not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060002', 'A', '01060002', 'BGSystem interface not found, please check if the network card is properly plugged in', 'BGSystem interface not found, please check if the network card is properly plugged in')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060003', 'A', '01060003', 'Does not match the configuration', 'Does not match the configuration')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060004', 'A', '01060004', 'Camera IP configuration error', 'Camera IP configuration error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060005', 'A', '01060005', 'Camera abnormality', 'Camera abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060006', 'A', '01060006', 'Camera failed to capture image', 'Camera failed to capture image')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060007', 'A', '01060007', 'Camera initialization error or not initialized yet', 'Camera initialization error or not initialized yet')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060008', 'A', '01060008', 'Camera Port initialization error or not initialized yet', 'Camera Port initialization error or not initialized yet')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060009', 'A', '01060009', 'Wrong camera serial number', 'Wrong camera serial number')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0106000A', 'A', '0106000A', 'Camera initialization failed', 'Camera initialization failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0106000B', 'A', '0106000B', 'Failed to start the camera', 'Failed to start the camera')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0106000C', 'A', '0106000C', 'Failed to stop camera', 'Failed to stop camera')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0106000D', 'A', '0106000D', 'Failed to set camera exposure time', 'Failed to set camera exposure time')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0106000E', 'A', '0106000E', 'Camera not turned on', 'Camera not turned on')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0106000F', 'A', '0106000F', 'Too many attempts to obtain camera images.', 'Too many attempts to obtain camera images.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060010', 'A', '01060010', 'The camera failed to obtain the current image.', 'The camera failed to obtain the current image.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060011', 'A', '01060011', 'Cannot use GetCurrentImage function in trigger mode', 'Cannot use GetCurrentImage function in trigger mode')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060012', 'A', '01060012', 'Cannot use AcqTriggerImage function in snapshot mode', 'Cannot use AcqTriggerImage function in snapshot mode')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060013', 'A', '01060013', 'Found the same IP', 'Found the same IP')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060014', 'A', '01060014', 'The number of camera hardware is less than the number of cameras enabled by the configuration', 'The number of camera hardware is less than the number of cameras enabled by the configuration')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060015', 'A', '01060015', 'Camera port initialization failed', 'Camera port initialization failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060016', 'A', '01060016', 'The camera IP or host IP configuration is wrong, they are not in the same subnet', 'The camera IP or host IP configuration is wrong, they are not in the same subnet')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060017', 'A', '01060017', 'Need to turn off the camera, you can set the camera trigger mode', 'Need to turn off the camera, you can set the camera trigger mode')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060018', 'A', '01060018', 'The camera does not support external trigger mode', 'The camera does not support external trigger mode')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060019', 'A', '01060019', 'Dynamic library exception', 'Dynamic library exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0106001A', 'A', '0106001A', 'The simulation image is required for software simulation to run', 'The simulation image is required for software simulation to run')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0106001B', 'A', '0106001B', 'IStage interface not referenced to object instance when initializing Basler camera', 'IStage interface not referenced to object instance when initializing Basler camera')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0106001C', 'A', '0106001C', 'stop trigger wait signal time out', 'stop trigger wait signal time out')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0106001D', 'A', '0106001D', 'Configuration height error', 'Configuration height error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0106001E', 'A', '0106001E', 'SetHeartbeatTimeout Failed, check', 'SetHeartbeatTimeout Failed, check')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0106001F', 'A', '0106001F', 'CloseCameraLowEnergyMode Failed, check', 'CloseCameraLowEnergyMode Failed, check')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060020', 'A', '01060020', 'MV_CC_CreateDevice_NET Error', 'MV_CC_CreateDevice_NET Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060021', 'A', '01060021', 'MV_CC_StartGrabbing_NET Error', 'MV_CC_StartGrabbing_NET Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060022', 'A', '01060022', 'MV_CC_OpenDevice_NET Error', 'MV_CC_OpenDevice_NET Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060023', 'A', '01060023', 'get payload size Error', 'get payload size Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060024', 'A', '01060024', 'Unknown trigger source', 'Unknown trigger source')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060025', 'A', '01060025', 'Mv camera enum device failed', 'Mv camera enum device failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01060026', 'A', '01060026', 'Invalid frame received', 'Invalid frame received')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01070001', 'A', '01070001', 'EFEM module communication abnormality', 'EFEM module communication abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01070002', 'A', '01070002', 'EFEM received data abnormality', 'EFEM received data abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01070003', 'A', '01070003', 'Connection timeout', 'Connection timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01080001', 'A', '01080001', 'Meter communication abnormality', 'Meter communication abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01090001', 'A', '01090001', 'SerialModbus connection failed', 'SerialModbus connection failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010B0001', 'A', '010B0001', 'Flow meter communication abnormality', 'Flow meter communication abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010C0001', 'A', '010C0001', 'Failed to obtain temperature and humidity, please check the hardware', 'Failed to obtain temperature and humidity, please check the hardware')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010C0002', 'A', '010C0002', 'Failed to obtain the air conditioner status. The received data format is incorrect.', 'Failed to obtain the air conditioner status. The received data format is incorrect.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010C0003', 'A', '010C0003', 'Failed to obtain the air conditioner status', 'Failed to obtain the air conditioner status')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010C0004', 'A', '010C0004', 'Communication Error', 'Communication Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010C0005', 'A', '010C0005', 'The value is not null', 'The value is not null')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010D0001', 'A', '010D0001', 'Communication failed', 'Communication failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010D0002', 'A', '010D0002', 'The current multi-channel control still fails after multiple sends', 'The current multi-channel control still fails after multiple sends')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010D0003', 'A', '010D0003', 'The current serial port is not open', 'The current serial port is not open')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010D0004', 'A', '010D0004', 'The current single channel control still fails after multiple sends', 'The current single channel control still fails after multiple sends')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0001', 'A', '010E0001', 'Bsa board channel number does not match', 'Bsa board channel number does not match')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0002', 'A', '010E0002', 'Not within the board channel range', 'Not within the board channel range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0003', 'A', '010E0003', 'Current establishment failure', 'Current establishment failure')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0004', 'A', '010E0004', 'LD switch error', 'LD switch error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0005', 'A', '010E0005', 'Temperature is too high', 'Temperature is too high')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0006', 'A', '010E0006', 'Current value exceeds the range', 'Current value exceeds the range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0007', 'A', '010E0007', 'Voltage value exceeds the range', 'Voltage value exceeds the range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0008', 'A', '010E0008', 'Failed to turn off laser single channel', 'Failed to turn off laser single channel')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0009', 'A', '010E0009', 'Failed to turn off all laser channels', 'Failed to turn off all laser channels')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E000A', 'A', '010E000A', 'Failed to obtain current of all channels', 'Failed to obtain current of all channels')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E000B', 'A', '010E000B', 'Failed to obtain the laser single channel current', 'Failed to obtain the laser single channel current')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E000C', 'A', '010E000C', 'Failed to open single channel of laser', 'Failed to open single channel of laser')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E000D', 'A', '010E000D', 'Failed to open all laser channels', 'Failed to open all laser channels')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E000E', 'A', '010E000E', 'Failed to set the current of all laser channels', 'Failed to set the current of all laser channels')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E000F', 'A', '010E000F', 'Failed to set the laser single channel current', 'Failed to set the laser single channel current')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0010', 'A', '010E0010', 'Failed to obtain the current laser energy', 'Failed to obtain the current laser energy')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0011', 'A', '010E0011', 'Failed to obtain batch status of IO board', 'Failed to obtain batch status of IO board')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0012', 'A', '010E0012', 'Port code mismatch', 'Port code mismatch')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0013', 'A', '010E0013', 'Port type mismatch', 'Port type mismatch')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0014', 'A', '010E0014', 'Failed to obtain a single status of the IO board', 'Failed to obtain a single status of the IO board')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0015', 'A', '010E0015', 'IO board failed to set a single state', 'IO board failed to set a single state')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0016', 'A', '010E0016', 'The vacuum is locked, please unlock it first', 'The vacuum is locked, please unlock it first')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0017', 'A', '010E0017', 'Laser board channel number does not match', 'Laser board channel number does not match')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0018', 'A', '010E0018', 'Failed to obtain the laser single channel current', 'Failed to obtain the laser single channel current')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0019', 'A', '010E0019', 'Failed to obtain current of all channels', 'Failed to obtain current of all channels')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E001A', 'A', '010E001A', 'Failed to obtain laser temperature', 'Failed to obtain laser temperature')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E001B', 'A', '010E001B', 'Set all currents failed', 'Set all currents failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E001C', 'A', '010E001C', 'Failed to set single channel current', 'Failed to set single channel current')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E001D', 'A', '010E001D', 'Channel number error', 'Channel number error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E001E', 'A', '010E001E', 'Current out of range', 'Current out of range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E001F', 'A', '010E001F', 'Voltage out of range', 'Voltage out of range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0020', 'A', '010E0020', 'Temperature error', 'Temperature error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0021', 'A', '010E0021', 'Failed to switch all channel lasers', 'Failed to switch all channel lasers')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0022', 'A', '010E0022', 'Switching single channel laser fails', 'Switching single channel laser fails')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0023', 'A', '010E0023', 'Switch error (laser internal error)', 'Switch error (laser internal error)')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0024', 'A', '010E0024', 'Laser board current exceeds the range', 'Laser board current exceeds the range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0025', 'A', '010E0025', 'Not within the board channel range', 'Not within the board channel range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0026', 'A', '010E0026', 'Laser shutdown failed', 'Laser shutdown failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0027', 'A', '010E0027', 'Laser action failed', 'Laser action failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0028', 'A', '010E0028', 'The current version of the laser does not support the interface for obtaining the maximum threshold current', 'The current version of the laser does not support the interface for obtaining the maximum threshold current')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0029', 'A', '010E0029', 'Unknown status code', 'Unknown status code')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E002A', 'A', '010E002A', 'The current version of the laser does not support the 24W power test interface', 'The current version of the laser does not support the 24W power test interface')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E002B', 'A', '010E002B', 'Laser failed to set 24W current', 'Laser failed to set 24W current')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E002C', 'A', '010E002C', 'The laser control board fails to operate the laser', 'The laser control board fails to operate the laser')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E002D', 'A', '010E002D', 'The laser control board failed to turn on the laser', 'The laser control board failed to turn on the laser')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E002E', 'A', '010E002E', 'The laser control board failed to turn on all lasers', 'The laser control board failed to turn on all lasers')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E002F', 'A', '010E002F', 'The laser control board failed to shut down the laser', 'The laser control board failed to shut down the laser')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0030', 'A', '010E0030', 'The laser control board failed to shut down all lasers', 'The laser control board failed to shut down all lasers')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0031', 'A', '010E0031', 'Failed to start auto focus', 'Failed to start auto focus')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0032', 'A', '010E0032', 'Failed to stop autofocus, unable to get status code (index out of range)', 'Failed to stop autofocus, unable to get status code (index out of range)')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0033', 'A', '010E0033', 'Failed to stop auto focus, and returned status code error.', 'Failed to stop auto focus, and returned status code error.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0034', 'A', '010E0034', 'Failed to stop auto focus', 'Failed to stop auto focus')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0035', 'A', '010E0035', 'Failed to set mapping', 'Failed to set mapping')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0036', 'A', '010E0036', 'The result code returned by the self-calibration shows an error', 'The result code returned by the self-calibration shows an error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0037', 'A', '010E0037', 'Autofocus self-calibration failed', 'Autofocus self-calibration failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0038', 'A', '010E0038', 'Failed to obtain the actual position of the motor', 'Failed to obtain the actual position of the motor')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0039', 'A', '010E0039', 'Failed to get the motor status', 'Failed to get the motor status')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E003A', 'A', '010E003A', 'The command motor position exceeds the software configured limit', 'The command motor position exceeds the software configured limit')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E003B', 'A', '010E003B', 'Hardware status code error when moving motor', 'Hardware status code error when moving motor')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E003C', 'A', '010E003C', 'Failure to move the motor', 'Failure to move the motor')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E003D', 'A', '010E003D', 'Status code error when the motor returns to zero', 'Status code error when the motor returns to zero')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E003E', 'A', '010E003E', 'Motor return to zero failed', 'Motor return to zero failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E003F', 'A', '010E003F', 'Failed to obtain the auto focus status', 'Failed to obtain the auto focus status')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0040', 'A', '010E0040', 'Failed to set auto focus parameters', 'Failed to set auto focus parameters')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0041', 'A', '010E0041', 'Failed to set auto focus parameters, status code error', 'Failed to set auto focus parameters, status code error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0042', 'A', '010E0042', 'Failed to get sensor value', 'Failed to get sensor value')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0043', 'A', '010E0043', 'Failed to read data from the serial port', 'Failed to read data from the serial port')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0044', 'A', '010E0044', 'Serial port is not open', 'Serial port is not open')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0045', 'A', '010E0045', 'Not initialized yet', 'Not initialized yet')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0046', 'A', '010E0046', '[BoardConfigAttribute] not found', '[BoardConfigAttribute] not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0047', 'A', '010E0047', 'BoardConfigAttribute configuration error, BoardType not found', 'BoardConfigAttribute configuration error, BoardType not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0048', 'A', '010E0048', 'Network Error', 'Network Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0049', 'A', '010E0049', 'Communication Error', 'Communication Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E004A', 'A', '010E004A', 'Network connection timed out', 'Network connection timed out')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E004B', 'A', '010E004B', 'Network not connected', 'Network not connected')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E004C', 'A', '010E004C', 'Reading data has timed out', 'Reading data has timed out')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E004D', 'A', '010E004D', 'The remote device is turned off', 'The remote device is turned off')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E004E', 'A', '010E004E', 'Too many communication retransmissions', 'Too many communication retransmissions')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E004F', 'A', '010E004F', 'The returned data is empty', 'The returned data is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0050', 'A', '010E0050', 'Receive packet header error', 'Receive packet header error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0051', 'A', '010E0051', 'Packet receiving and sending end encoding error', 'Packet receiving and sending end encoding error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0052', 'A', '010E0052', 'The received packet length is incorrect.', 'The received packet length is incorrect.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0053', 'A', '010E0053', 'Packet receiving instruction error', 'Packet receiving instruction error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0054', 'A', '010E0054', 'Packet receiving check error', 'Packet receiving check error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0055', 'A', '010E0055', 'Value is Null', 'Value is Null')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0056', 'A', '010E0056', 'The temperature probe you are looking for does not exist in the temperature device serial number table', 'The temperature probe you are looking for does not exist in the temperature device serial number table')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0057', 'A', '010E0057', 'The mapping data for the displacement sensor is null', 'The mapping data for the displacement sensor is null')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0058', 'A', '010E0058', 'The mapping data for the displacement sensor is not 20 groups', 'The mapping data for the displacement sensor is not 20 groups')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0059', 'A', '010E0059', 'Error undefined', 'Error undefined')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E005A', 'A', '010E005A', 'Failed to set current time', 'Failed to set current time')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E005B', 'A', '010E005B', 'Key not found in IO configuration', 'Key not found in IO configuration')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E005C', 'A', '010E005C', 'The number of laser bands and currents do not match', 'The number of laser bands and currents do not match')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E005D', 'A', '010E005D', 'Failed to obtain laser fiber temperature', 'Failed to obtain laser fiber temperature')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E005E', 'A', '010E005E', 'Setting the laser on mode error', 'Setting the laser on mode error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E005F', 'A', '010E005F', 'Get the maximum threshold current error', 'Get the maximum threshold current error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0060', 'A', '010E0060', 'Get laser current status error', 'Get laser current status error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0061', 'A', '010E0061', 'Status code undefined', 'Status code undefined')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0062', 'A', '010E0062', 'Failed to query driver board information', 'Failed to query driver board information')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0063', 'A', '010E0063', 'Failed to set the driver board ID', 'Failed to set the driver board ID')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0064', 'A', '010E0064', 'Motor type undefined', 'Motor type undefined')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0065', 'A', '010E0065', 'Motor status type undefined', 'Motor status type undefined')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0066', 'A', '010E0066', 'Return data exception', 'Return data exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010E0067', 'A', '010E0067', 'Packet receiving instruction error', 'Packet receiving instruction error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010F0001', 'A', '010F0001', 'The received data length is abnormal', 'The received data length is abnormal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010F0002', 'A', '010F0002', 'Air conditioning connection failed', 'Air conditioning connection failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010F0003', 'A', '010F0003', 'Abnormal air conditioning settings', 'Abnormal air conditioning settings')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010F0004', 'A', '010F0004', 'Air conditioning control abnormality', 'Air conditioning control abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010F0005', 'A', '010F0005', 'Air conditioning access abnormality', 'Air conditioning access abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010F0006', 'A', '010F0006', 'Invalid response value', 'Invalid response value')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010F0007', 'A', '010F0007', 'No feedback data', 'No feedback data')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010F0008', 'A', '010F0008', 'Communication abnormality', 'Communication abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('010F0009', 'A', '010F0009', 'XOR data is empty', 'XOR data is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01100001', 'A', '01100001', 'Failed to connect to PLC', 'Failed to connect to PLC')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01100002', 'A', '01100002', 'PLC communication error', 'PLC communication error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01110001', 'A', '01110001', 'Communication Error', 'Communication Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01110002', 'A', '01110002', 'Packet receiving check error', 'Packet receiving check error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01110003', 'A', '01110003', 'Abnormal response', 'Abnormal response')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01110004', 'A', '01110004', 'Packet check error, packet incomplete, BCC cannot be found', 'Packet check error, packet incomplete, BCC cannot be found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01110005', 'A', '01110005', 'Packet check error, packet information is redundant: in addition to bcc, there are other garbled characters at the end', 'Packet check error, packet information is redundant: in addition to bcc, there are other garbled characters at the end')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01110006', 'A', '01110006', 'Packet check error, bcc is not: **', 'Packet check error, bcc is not: **')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01110007', 'A', '01110007', 'Value cannot be null', 'Value cannot be null')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01120001', 'A', '01120001', 'can not get ioboard interface', 'can not get ioboard interface')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01120002', 'A', '01120002', 'can not get stage interface', 'can not get stage interface')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01120003', 'A', '01120003', 'can not get Axis interface', 'can not get Axis interface')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01120004', 'A', '01120004', 'Abnormal closing of the pressure plate device', 'Abnormal closing of the pressure plate device')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01120005', 'A', '01120005', 'Abnormal Pmac control of the pressure plate device', 'Abnormal Pmac control of the pressure plate device')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01120006', 'A', '01120006', 'Platen shaft not found', 'Platen shaft not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01120007', 'A', '01120007', 'Moving platen axis error', 'Moving platen axis error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01120008', 'A', '01120008', 'Get the platen axis error', 'Get the platen axis error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01120009', 'A', '01120009', 'Error message when running edge search buff', 'Error message when running edge search buff')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01130001', 'A', '01130001', 'Scaner init error', 'Scaner init error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01130002', 'A', '01130002', 'Communication abnormality', 'Communication abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01130003', 'A', '01130003', 'Value cannot be null', 'Value cannot be null')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01140001', 'A', '01140001', 'Serial communication error', 'Serial communication error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01140002', 'A', '01140002', 'Serial communication packet inspection found an error', 'Serial communication packet inspection found an error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01140003', 'A', '01140003', 'Laser board communication error', 'Laser board communication error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01140004', 'A', '01140004', 'Energy detection board communication error', 'Energy detection board communication error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01140005', 'A', '01140005', '[BoardConfigAttribute] not found', '[BoardConfigAttribute] not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01140006', 'A', '01140006', 'BoardConfigAttribute configuration error, BoardType not found', 'BoardConfigAttribute configuration error, BoardType not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01160001', 'A', '01160001', 'SerialModbus connection failed', 'SerialModbus connection failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01160002', 'A', '01160002', 'SerialModbus input value exceeds the maximum register range', 'SerialModbus input value exceeds the maximum register range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01160003', 'A', '01160003', 'The SerialModbus input value exceeds the minimum register range', 'The SerialModbus input value exceeds the minimum register range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01160004', 'A', '01160004', 'Controlling exceptions', 'Controlling exceptions')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01160005', 'A', '01160005', 'Error code length is abnormal', 'Error code length is abnormal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01170001', 'A', '01170001', 'SerialModbus connection failed', 'SerialModbus connection failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01170002', 'A', '01170002', 'The value is not null', 'The value is not null')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180001', 'A', '01180001', 'Mapping data parsing error', 'Mapping data parsing error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180002', 'E', '01180002', 'HomeError', 'HomeError')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180003', 'A', '01180003', 'Data file not found', 'Data file not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180004', 'A', '01180004', 'The length of the I interval cannot be 0', 'The length of the I interval cannot be 0')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180005', 'A', '01180005', 'The number of M pulses under the I interval length cannot be 0', 'The number of M pulses under the I interval length cannot be 0')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180006', 'A', '01180006', 'Network Error', 'Network Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180007', 'E', '01180007', 'Motor overheating', 'Motor overheating')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180008', 'E', '01180008', 'Master encoder not connected', 'Master encoder not connected')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180009', 'E', '01180009', 'The backup encoder is not connected', 'The backup encoder is not connected')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0118000A', 'E', '0118000A', 'Driver Warning', 'Driver Warning')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0118000B', 'E', '0118000B', 'Master encoder error', 'Master encoder error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0118000C', 'E', '0118000C', 'Backup encoder error', 'Backup encoder error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0118000D', 'E', '0118000D', 'Location Error', 'Location Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0118000E', 'E', '0118000E', 'Critical position error', 'Critical position error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0118000F', 'E', '0118000F', 'Speeding', 'Speeding')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180010', 'E', '01180010', 'Hyper Acceleration', 'Hyper Acceleration')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180011', 'E', '01180011', 'Overcurrent', 'Overcurrent')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180012', 'E', '01180012', 'Servo Processor Warning', 'Servo Processor Warning')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180013', 'A', '01180013', 'Programming Errors', 'Programming Errors')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180014', 'A', '01180014', 'Inner Error', 'Inner Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180015', 'A', '01180015', 'Time constraints', 'Time constraints')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180016', 'E', '01180016', 'Emergency Stop', 'Emergency Stop')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180017', 'E', '01180017', 'Servo interruption', 'Servo interruption')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180018', 'E', '01180018', 'Complete violation', 'Complete violation')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180019', 'E', '01180019', 'The current two-dimensional table data is abnormal. Please check the data and index carefully.', 'The current two-dimensional table data is abnormal. Please check the data and index carefully.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0118001A', 'A', '0118001A', 'An exception occurred while creating a platform operation object', 'An exception occurred while creating a platform operation object')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0118001B', 'E', '0118001B', 'Platform move failed', 'Platform move failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0118001C', 'E', '0118001C', 'Failed to wait for platform movement to complete', 'Failed to wait for platform movement to complete')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0118001D', 'E', '0118001D', 'Exception when asynchronous scan waits for motion to end', 'Exception when asynchronous scan waits for motion to end')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0118001E', 'E', '0118001E', 'Exceeding soft limit', 'Exceeding soft limit')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180020', 'A', '01180020', 'The mapping data of the platform axis does not exist', 'The mapping data of the platform axis does not exist')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180021', 'A', '01180021', 'Failed to obtain axis mapping data.', 'Failed to obtain axis mapping data.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180022', 'A', '01180022', 'Axis check failed', 'Axis check failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180023', 'A', '01180023', 'CTS Advantech control board abnormality', 'CTS Advantech control board abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180024', 'A', '01180024', 'Mapping is not enabled', 'Mapping is not enabled')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180025', 'A', '01180025', 'Method not implemented', 'Method not implemented')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180026', 'E', '01180026', 'The platform AsyncMoves too many times, up to 5 times, for specific errors, see the Tauren log', 'The platform AsyncMoves too many times, up to 5 times, for specific errors, see the Tauren log')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180027', 'E', '01180027', 'Move to the wrong target position, the stage or camera will crash', 'Move to the wrong target position, the stage or camera will crash')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01180028', 'A', '01180028', 'WriteVariable error', 'WriteVariable error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01190001', 'A', '01190001', 'Connection failed', 'Connection failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01190002', 'A', '01190002', 'The input value exceeds the maximum range of the register', 'The input value exceeds the maximum range of the register')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01190003', 'A', '01190003', 'The input value exceeds the minimum register range.', 'The input value exceeds the minimum register range.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01190004', 'A', '01190004', 'GetMappingError', 'GetMappingError')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01190005', 'A', '01190005', 'Mapping file not found', 'Mapping file not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011A0002', 'A', '011A0002', 'Connection timeout', 'Connection timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011A0003', 'A', '011A0003', 'Connection protocol error, unable to connect to remote server', 'Connection protocol error, unable to connect to remote server')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011A0004', 'A', '011A0004', 'MO sensor is in error state', 'MO sensor is in error state')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011A0005', 'A', '011A0005', 'MO sensor out of range', 'MO sensor out of range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011A0006', 'A', '011A0006', 'MO sensor under range', 'MO sensor under range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011A0007', 'A', '011A0007', 'MO sensor is invalid', 'MO sensor is invalid')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011A0008', 'A', '011A0008', 'SW sensor is in error state', 'SW sensor is in error state')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011A0009', 'A', '011A0009', 'The remote server is down', 'The remote server is down')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011A001A', 'A', '011A001A', 'Failed to send data', 'Failed to send data')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011A001B', 'A', '011A001B', 'Failed to receive data', 'Failed to receive data')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011B0001', 'A', '011B0001', 'The vacuum is locked, please unlock it first', 'The vacuum is locked, please unlock it first')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011B0002', 'A', '011B0002', 'can not get ioboard interface', 'can not get ioboard interface')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011B0003', 'A', '011B0003', 'can not get stage interface', 'can not get stage interface')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011B0004', 'A', '011B0004', 'ID number undefined', 'ID number undefined')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0001', 'A', '011C0001', 'Memory request exception', 'Memory request exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0002', 'A', '011C0002', 'Wrong length of writing TIFF file', 'Wrong length of writing TIFF file')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0003', 'A', '011C0003', 'Error opening TIFF file', 'Error opening TIFF file')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0004', 'A', '011C0004', 'Error reading TIFF configuration information', 'Error reading TIFF configuration information')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0005', 'A', '011C0005', 'Thread pool mutex lock error', 'Thread pool mutex lock error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0006', 'A', '011C0006', 'Thread pool mutex unlock error', 'Thread pool mutex unlock error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0007', 'A', '011C0007', 'System waiting for semaphore error', 'System waiting for semaphore error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0008', 'A', '011C0008', 'Thread pool unavailable', 'Thread pool unavailable')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0009', 'A', '011C0009', 'Unknown DGB operation', 'Unknown DGB operation')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C000A', 'A', '011C000A', 'Error creating service', 'Error creating service')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C000B', 'A', '011C000B', 'Service port reuse error', 'Service port reuse error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C000C', 'A', '011C000C', 'Service binding IP error', 'Service binding IP error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C000D', 'A', '011C000D', 'Service startup monitoring error', 'Service startup monitoring error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C000E', 'A', '011C000E', 'The corresponding file name was not found during vector transformation', 'The corresponding file name was not found during vector transformation')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C000F', 'A', '011C000F', 'Generate strip parameter error', 'Generate strip parameter error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0010', 'A', '011C0010', 'Memory request error during strip expansion', 'Memory request error during strip expansion')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0011', 'A', '011C0011', 'An error occurred while requesting a transfer queue', 'An error occurred while requesting a transfer queue')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0012', 'A', '011C0012', 'Transmission logic error', 'Transmission logic error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0013', 'A', '011C0013', 'The transfer thread is not enabled', 'The transfer thread is not enabled')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0014', 'A', '011C0014', 'DGB reset error', 'DGB reset error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0015', 'A', '011C0015', 'DGB shutdown error', 'DGB shutdown error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0016', 'A', '011C0016', 'DGB unknown error', 'DGB unknown error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0017', 'A', '011C0017', 'DGB open error', 'DGB open error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0018', 'A', '011C0018', 'DGB CMN BUFFER error', 'DGB CMN BUFFER error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0019', 'A', '011C0019', 'DGB DIMM initialization error', 'DGB DIMM initialization error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C001A', 'A', '011C001A', 'DGB register timeout', 'DGB register timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C001B', 'A', '011C001B', 'DGB DIMM not ready', 'DGB DIMM not ready')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C001C', 'A', '011C001C', 'DGB''s fiber not ready', 'DGB''s fiber not ready')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C001D', 'A', '011C001D', 'PCIE Lane Error for DGB', 'PCIE Lane Error for DGB')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C001E', 'A', '011C001E', 'CRC check error of DGB''s FPGA1', 'CRC check error of DGB''s FPGA1')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C001F', 'A', '011C001F', 'CRC check error of DGB''s FPGA2', 'CRC check error of DGB''s FPGA2')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0020', 'A', '011C0020', 'CRC check error of DGB''s FPGA3', 'CRC check error of DGB''s FPGA3')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0021', 'A', '011C0021', 'DGB used an unknown register operation type', 'DGB used an unknown register operation type')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0022', 'A', '011C0022', 'DGB sets DMD flip direction error', 'DGB sets DMD flip direction error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0023', 'A', '011C0023', 'DGB flip frame frequency error', 'DGB flip frame frequency error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0024', 'A', '011C0024', 'Underrun error occurs on DGB DIMM', 'Underrun error occurs on DGB DIMM')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0025', 'A', '011C0025', 'DGB DIMM has a read-write conflict', 'DGB DIMM has a read-write conflict')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0026', 'A', '011C0026', 'DGB not reset', 'DGB not reset')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0027', 'A', '011C0027', 'An error occurred when DGB requested memory for DMA transfer', 'An error occurred when DGB requested memory for DMA transfer')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0028', 'A', '011C0028', 'DGB write data error', 'DGB write data error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0029', 'A', '011C0029', 'DGB start DMA error', 'DGB start DMA error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C002A', 'A', '011C002A', 'DGB error while waiting for write data to complete', 'DGB error while waiting for write data to complete')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C002B', 'A', '011C002B', 'DGB write data timeout', 'DGB write data timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C002C', 'A', '011C002C', 'DGB Waiting for P17 Error', 'DGB Waiting for P17 Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C002D', 'A', '011C002D', 'DGB waits for P17 timeout', 'DGB waits for P17 timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C002E', 'A', '011C002E', 'DGB start read DMA error', 'DGB start read DMA error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0030', 'A', '011C0030', 'DGB error while waiting for read to complete', 'DGB error while waiting for read to complete')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0031', 'A', '011C0031', 'DGB read data error', 'DGB read data error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0032', 'A', '011C0032', 'DGB forced to stop transmission', 'DGB forced to stop transmission')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0033', 'A', '011C0033', 'DGB static projection application memory error', 'DGB static projection application memory error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0034', 'A', '011C0034', 'DGB static projection file creation error', 'DGB static projection file creation error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0035', 'A', '011C0035', 'DGB static projection parameter error', 'DGB static projection parameter error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0036', 'A', '011C0036', 'MVF file name cannot be empty', 'MVF file name cannot be empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0037', 'A', '011C0037', 'MVF file format error', 'MVF file format error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0038', 'A', '011C0038', 'MVF did not find the specified file', 'MVF did not find the specified file')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0039', 'A', '011C0039', 'Wrong number of layers in MVF', 'Wrong number of layers in MVF')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C003A', 'A', '011C003A', 'Initialization exception', 'Initialization exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C003B', 'A', '011C003B', 'Connection timed out!', 'Connection timed out!')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C003C', 'A', '011C003C', 'Unable to connect to remote server', 'Unable to connect to remote server')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C003D', 'A', '011C003D', 'The remote server has an exception', 'The remote server has an exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C003E', 'A', '011C003E', 'Communication abnormality', 'Communication abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C003F', 'A', '011C003F', 'The communication version of the remote server and the local interface is inconsistent!', 'The communication version of the remote server and the local interface is inconsistent!')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0040', 'A', '011C0040', 'Template image width is incorrect', 'Template image width is incorrect')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0041', 'A', '011C0041', 'The template image is not a monochrome image', 'The template image is not a monochrome image')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0042', 'A', '011C0042', 'Speed ​​not found, please check Warden configuration file', 'Speed ​​not found, please check Warden configuration file')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0043', 'A', '011C0043', 'Initialization Exception', 'Initialization Exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0044', 'A', '011C0044', 'Image file format error', 'Image file format error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0045', 'A', '011C0045', 'Image file not found', 'Image file not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0046', 'A', '011C0046', 'Template file does not exist', 'Template file does not exist')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0047', 'A', '011C0047', 'DMD operation error', 'DMD operation error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0048', 'A', '011C0048', 'Lens distortion interval value [Step] cannot be less than or equal to 0', 'Lens distortion interval value [Step] cannot be less than or equal to 0')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C0049', 'A', '011C0049', 'The number of values ​​[CompensationValue] in the lens distortion compensation table cannot be less than two', 'The number of values ​​[CompensationValue] in the lens distortion compensation table cannot be less than two')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C004A', 'A', '011C004A', 'Sending data abnormally', 'Sending data abnormally')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011C004B', 'A', '011C004B', 'Abnormal data received', 'Abnormal data received')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0001', 'A', '011E0001', 'usb communication failed', 'usb communication failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0002', 'A', '011E0002', 'The received data packet is too small', 'The received data packet is too small')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0003', 'A', '011E0003', 'Receive header error', 'Receive header error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0004', 'A', '011E0004', 'Receive data error', 'Receive data error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0005', 'A', '011E0005', 'Wrong receiving end number', 'Wrong receiving end number')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0006', 'A', '011E0006', 'Wrong sender ID', 'Wrong sender ID')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0007', 'A', '011E0007', 'Command mode error', 'Command mode error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0008', 'A', '011E0008', 'Wrong command number', 'Wrong command number')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0009', 'A', '011E0009', 'Command word error', 'Command word error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E000A', 'A', '011E000A', 'Receive data error, checksum error', 'Receive data error, checksum error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E000B', 'A', '011E000B', 'USB sending information failed', 'USB sending information failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E000C', 'A', '011E000C', 'USB receiving information failed', 'USB receiving information failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E000D', 'A', '011E000D', 'Pulse trigger number is not configured', 'Pulse trigger number is not configured')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E000E', 'A', '011E000E', 'Error sending prepare data', 'Error sending prepare data')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E000F', 'A', '011E000F', 'Synchronous board count error', 'Synchronous board count error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0010', 'A', '011E0010', 'Synchronous board check completed with error', 'Synchronous board check completed with error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0011', 'A', '011E0011', 'Error in setting dmd parameters', 'Error in setting dmd parameters')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0012', 'A', '011E0012', 'Wrong setting of A/B phase direction', 'Wrong setting of A/B phase direction')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0013', 'A', '011E0013', 'Error initializing device', 'Error initializing device')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0014', 'A', '011E0014', 'usb communication error', 'usb communication error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0015', 'A', '011E0015', 'Error in checking the sent and received data packets', 'Error in checking the sent and received data packets')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0016', 'A', '011E0016', 'Synchronous board version check error', 'Synchronous board version check error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0017', 'A', '011E0017', 'The device port is not initialized or initialization fails', 'The device port is not initialized or initialization fails')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0018', 'A', '011E0018', 'The specified sync board device was not found', 'The specified sync board device was not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E0019', 'A', '011E0019', 'The specified sync board device was not found', 'The specified sync board device was not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E001A', 'A', '011E001A', 'The sent data is too long', 'The sent data is too long')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E001B', 'A', '011E001B', 'Sending data abnormally', 'Sending data abnormally')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E001C', 'A', '011E001C', 'stageIndex error', 'stageIndex error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E001D', 'A', '011E001D', 'LensCount and residuals.Count are different', 'LensCount and residuals.Count are different')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011E001E', 'A', '011E001E', 'Speed ​​deviation threshold exceeded', 'Speed ​​deviation threshold exceeded')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('011F0001', 'A', '011F0001', 'New meter communication abnormality', 'New meter communication abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01200001', 'A', '01200001', 'Bus connection failed', 'Bus connection failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01200002', 'A', '01200002', 'Triggering an exception', 'Triggering an exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01200003', 'A', '01200003', 'Failed to set point', 'Failed to set point')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01210001', 'A', '01210001', 'PressureGauge connection failed', 'PressureGauge connection failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('01220001', 'A', '01220001', 'MAIWDWaterGauge connection failed', 'MAIWDWaterGauge connection failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010001', 'A', '03010001', 'Parsing Error', 'Parsing Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010002', 'W', '03010002', 'Graphics that cannot be processed appear', 'Graphics that cannot be processed appear')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010003', 'A', '03010003', 'The number of points in the linear ring cannot be 0', 'The number of points in the linear ring cannot be 0')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010004', 'A', '03010004', 'Unknown unit, unable to convert from millimeters to the specified unit', 'Unknown unit, unable to convert from millimeters to the specified unit')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010005', 'A', '03010005', 'The header of mvf is empty', 'The header of mvf is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010006', 'A', '03010006', 'The length of mvf is less than or equal to 0', 'The length of mvf is less than or equal to 0')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010007', 'A', '03010007', 'MD5 code of Mvf file is abnormal', 'MD5 code of Mvf file is abnormal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010008', 'A', '03010008', 'Variable width polylines are not supported yet', 'Variable width polylines are not supported yet')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010009', 'A', '03010009', 'File does not exist', 'File does not exist')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301000A', 'A', '0301000A', 'Mvf conversion error', 'Mvf conversion error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301000B', 'A', '0301000B', 'File opening exception', 'File opening exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301000C', 'A', '0301000C', 'Duplicate module name', 'Duplicate module name')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301000D', 'A', '0301000D', 'The number of positioning coordinates of the referenced module array is wrong', 'The number of positioning coordinates of the referenced module array is wrong')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301000E', 'A', '0301000E', 'Moire rotation anomaly', 'Moire rotation anomaly')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301000F', 'A', '0301000F', 'Thermal can only rotate at the origin', 'Thermal can only rotate at the origin')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010010', 'A', '03010010', 'stream or encoding is empty', 'stream or encoding is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010011', 'W', '03010011', 'gerber parsing error', 'gerber parsing error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010012', 'A', '03010012', 'gerber parsing error', 'gerber parsing error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010013', 'A', '03010013', 'Profile file needs to be parsed first', 'Profile file needs to be parsed first')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010014', 'A', '03010014', 'Exception when writing MVF conversion file', 'Exception when writing MVF conversion file')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010015', 'A', '03010015', 'Unknown polygon type', 'Unknown polygon type')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010016', 'A', '03010016', 'The include directive is not supported', 'The include directive is not supported')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010017', 'A', '03010017', 'Coordinates out of allowed range', 'Coordinates out of allowed range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010018', 'A', '03010018', 'Path Error', 'Path Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010019', 'A', '03010019', 'UpdateEdgeIntoAEL: invalid call', 'UpdateEdgeIntoAEL: invalid call')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301001A', 'A', '0301001A', 'PolyTree struct is needed for open path clipping', 'PolyTree struct is needed for open path clipping')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301001B', 'A', '0301001B', 'ProcessIntersections error', 'ProcessIntersections error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301001C', 'A', '0301001C', 'DoMaxima error', 'DoMaxima error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301001D', 'A', '0301001D', 'Character parsing error', 'Character parsing error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301001E', 'A', '0301001E', 'tgz decompression failed', 'tgz decompression failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301001F', 'A', '0301001F', 'can not find font parse result', 'can not find font parse result')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010020', 'A', '03010020', 'GetBaseLocation error', 'GetBaseLocation error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010021', 'A', '03010021', 'Unknown Geometry subtype', 'Unknown Geometry subtype')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010022', 'A', '03010022', 'Snap goes wrong', 'Snap goes wrong')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010023', 'A', '03010023', 'No ClipAttributeValue, border not found', 'No ClipAttributeValue, border not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010024', 'A', '03010024', 'There is no LineRecord in the symbol', 'There is no LineRecord in the symbol')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010025', 'A', '03010025', 'Digital tube replacement abnormality', 'Digital tube replacement abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010026', 'A', '03010026', 'Embedded resource file not found', 'Embedded resource file not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010027', 'A', '03010027', 'record geometry must create first', 'record geometry must create first')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010028', 'A', '03010028', 'simulated record', 'simulated record')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03010029', 'A', '03010029', 'The current version of the software does not support shx font text', 'The current version of the software does not support shx font text')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301002A', 'A', '0301002A', 'Unable to obtain parsed sr table', 'Unable to obtain parsed sr table')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301002B', 'A', '0301002B', 'spokes num out of range', 'spokes num out of range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301002C', 'A', '0301002C', 'There is a problem with the pixel setting of the QR code', 'There is a problem with the pixel setting of the QR code')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0301002D', 'A', '0301002D', 'The layer used by the odb++ job has no graphic information', 'The layer used by the odb++ job has no graphic information')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03020001', 'A', '03020001', 'Bitmap merging error', 'Bitmap merging error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03020002', 'A', '03020002', 'no contour edge exist', 'no contour edge exist')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03020003', 'A', '03020003', 'Merge polygon anomalies', 'Merge polygon anomalies')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03020004', 'A', '03020004', 'PrepairMerge src geometry vertex number 0 or null', 'PrepairMerge src geometry vertex number 0 or null')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03020005', 'A', '03020005', 'MergeGeomsEdgeList, ValidPairNum > 0', 'MergeGeomsEdgeList, ValidPairNum > 0')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03020006', 'A', '03020006', 'Status is 1', 'Status is 1')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03020007', 'A', '03020007', 'ValidPairNum error', 'ValidPairNum error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03020008', 'A', '03020008', 'MergeGeometryByPairs idx != polylineLength', 'MergeGeometryByPairs idx != polylineLength')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03020009', 'A', '03020009', 'error in PitchEdgeInfo', 'error in PitchEdgeInfo')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0302000A', 'A', '0302000A', 'Empty polygon appears', 'Empty polygon appears')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0302000B', 'A', '0302000B', 'Graphics that cannot be processed appear', 'Graphics that cannot be processed appear')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0302000C', 'A', '0302000C', 'File does not exist', 'File does not exist')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0302000D', 'A', '0302000D', 'Contour merging anomaly', 'Contour merging anomaly')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0302000E', 'A', '0302000E', 'Inconsistent image sizes', 'Inconsistent image sizes')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03030001', 'A', '03030001', 'Vector mode merging error', 'Vector mode merging error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03030002', 'W', '03030002', 'Graphics that cannot be processed appear', 'Graphics that cannot be processed appear')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03030003', 'A', '03030003', 'Vector image buffer error', 'Vector image buffer error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03030004', 'W', '03030004', 'The number of points in the linear ring cannot be 0', 'The number of points in the linear ring cannot be 0')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03030005', 'A', '03030005', 'Check surface fast merge exception', 'Check surface fast merge exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03030006', 'W', '03030006', 'The external interface of the combined calculation is abnormal', 'The external interface of the combined calculation is abnormal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03030007', 'W', '03030007', 'Possible merging errors', 'Possible merging errors')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03030008', 'A', '03030008', 'Quickly merge Surface and there will be an error', 'Quickly merge Surface and there will be an error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03030009', 'A', '03030009', 'Intersection Error', 'Intersection Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0303000A', 'A', '0303000A', 'Calculation error', 'Calculation error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03040001', 'A', '03040001', 'Segmentation anomaly', 'Segmentation anomaly')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03040002', 'A', '03040002', 'The file name is empty or the file does not exist', 'The file name is empty or the file does not exist')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03040003', 'A', '03040003', 'The split interface does not currently support non-MVF format graphic files', 'The split interface does not currently support non-MVF format graphic files')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03040004', 'A', '03040004', 'Unable to split, value must be 1', 'Unable to split, value must be 1')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03040005', 'A', '03040005', 'The split parameter is empty', 'The split parameter is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('03040006', 'A', '03040006', 'mvf cutting error', 'mvf cutting error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010001', 'A', '04010001', 'tiff file format is not supported', 'tiff file format is not supported')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010002', 'A', '04010002', 'File format not supported', 'File format not supported')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010003', 'A', '04010003', 'LiteDBErr', 'LiteDBErr')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010004', 'A', '04010004', 'LogErr', 'LogErr')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010005', 'A', '04010005', 'Other bit depths are not converted to BitmapSource', 'Other bit depths are not converted to BitmapSource')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010006', 'A', '04010006', 'An exception occurred when parsing data', 'An exception occurred when parsing data')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010007', 'A', '04010007', 'No data available in the table', 'No data available in the table')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010008', 'A', '04010008', 'LightTable1DTableValueNotFound', 'LightTable1DTableValueNotFound')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010009', 'A', '04010009', 'Two-dimensional table parsing exception', 'Two-dimensional table parsing exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0401000A', 'W', '0401000A', 'OutOfMemory', 'OutOfMemory')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0401000B', 'A', '0401000B', 'ResourceFormatError', 'ResourceFormatError')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0401000C', 'A', '0401000C', 'ResourceNotFound', 'ResourceNotFound')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0401000D', 'A', '0401000D', 'ResxKeyNotFound', 'ResxKeyNotFound')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0401000E', 'A', '0401000E', 'FileNotFound', 'FileNotFound')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0401000F', 'A', '0401000F', 'TomlTableError', 'TomlTableError')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010010', 'A', '04010010', 'TomlArrayError', 'TomlArrayError')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010011', 'A', '04010011', 'Cannot create object of type', 'Cannot create object of type')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010012', 'A', '04010012', 'TomlValueConvertError', 'TomlValueConvertError')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010013', 'A', '04010013', 'Folder does not exist', 'Folder does not exist')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010014', 'A', '04010014', 'Script compilation error', 'Script compilation error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010015', 'A', '04010015', 'Script execution error', 'Script execution error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04010016', 'W', '04010016', 'Excel write in failed', 'Excel write in failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04020001', 'A', '04020001', 'The message is too long and exceeds the maximum length', 'The message is too long and exceeds the maximum length')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04020002', 'A', '04020002', 'ScsConnectToServerTimeout', 'ScsConnectToServerTimeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04020003', 'A', '04020003', 'ClientReConnErr', 'ClientReConnErr')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04020004', 'A', '04020004', 'ScsCommSendMessageError', 'ScsCommSendMessageError')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04020005', 'A', '04020005', 'Not a valid terminal address', 'Not a valid terminal address')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04020006', 'A', '04020006', 'Unsupported protocol', 'Unsupported protocol')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04020007', 'A', '04020007', 'Unable to receive data, timeout has occurred', 'Unable to receive data, timeout has occurred')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04020008', 'A', '04020008', 'Unable to receive data, disconnected', 'Unable to receive data, disconnected')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04020009', 'A', '04020009', 'The message server has stopped and no longer receives messages.', 'The message server has stopped and no longer receives messages.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0402000A', 'A', '0402000A', 'Received unknown message', 'Received unknown message')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0402000B', 'A', '0402000B', 'The input stream is closed and cannot be read', 'The input stream is closed and cannot be read')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0402000C', 'A', '0402000C', 'The client does not wait for the server''s method call', 'The client does not wait for the server''s method call')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0402000D', 'A', '0402000D', 'The client object cannot be obtained, it can only be used during message callback', 'The client object cannot be obtained, it can only be used during message callback')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0402000E', 'A', '0402000E', 'ScsServer is empty', 'ScsServer is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0402000F', 'A', '0402000F', 'ScsServiceErr', 'ScsServiceErr')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04030001', 'A', '04030001', 'The transformation matrix cannot be empty', 'The transformation matrix cannot be empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04030002', 'A', '04030002', 'The transformation matrix is ​​not a 3X3 matrix', 'The transformation matrix is ​​not a 3X3 matrix')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04030003', 'A', '04030003', 'Parameter error', 'Parameter error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04030004', 'A', '04030004', 'Matrix is ​​empty', 'Matrix is ​​empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04030005', 'A', '04030005', 'The number of matrix rows and columns is not equal', 'The number of matrix rows and columns is not equal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04030006', 'A', '04030006', 'matrix invert err', 'matrix invert err')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04030007', 'A', '04030007', 'matrix dimension err', 'matrix dimension err')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04030008', 'A', '04030008', 'matrix initial error', 'matrix initial error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04030009', 'A', '04030009', 'There is a problem with parameter configuration', 'There is a problem with parameter configuration')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0403000A', 'A', '0403000A', 'Parameter input error', 'Parameter input error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04040001', 'A', '04040001', 'ConvertBack Error', 'ConvertBack Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04040002', 'A', '04040002', 'NotImplemented', 'NotImplemented')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04040003', 'A', '04040003', 'ArgumentNull', 'ArgumentNull')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04040004', 'A', '04040004', 'Element not found', 'Element not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04040005', 'A', '04040005', 'XamlPlatformError', 'XamlPlatformError')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04040006', 'A', '04040006', 'ArgumentOutOfRange', 'ArgumentOutOfRange')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04040007', 'A', '04040007', 'TokenBufferError', 'TokenBufferError')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('04040008', 'A', '04040008', 'ReflectionUtil', 'ReflectionUtil')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05010001', 'W', '05010001', 'The Job name already exists, please delete it before creating it', 'The Job name already exists, please delete it before creating it')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05010002', 'W', '05010002', 'odb++ Job name font copy failed', 'odb++ Job name font copy failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05010003', 'W', '05010003', 'Failed to delete temporary directory in odb++ Job name input folder', 'Failed to delete temporary directory in odb++ Job name input folder')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011002', 'A', '05011002', 'Only supports single board mode', 'Only supports single board mode')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011003', 'A', '05011003', 'There is no alignment group, and the cam outer rectangle cannot be calculated.', 'There is no alignment group, and the cam outer rectangle cannot be calculated.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011004', 'A', '05011004', 'Segmentation graph abnormality', 'Segmentation graph abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011005', 'A', '05011005', 'The segmentation pattern configuration does not contain the area mode set for the current Job name', 'The segmentation pattern configuration does not contain the area mode set for the current Job name')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011006', 'A', '05011006', 'In the one-point-two-horizontal mode, the locator is abnormal', 'In the one-point-two-horizontal mode, the locator is abnormal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011007', 'A', '05011007', 'No segmentation graph exists', 'No segmentation graph exists')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011008', 'A', '05011008', 'Comparison of segmented graphics revealed significant differences', 'Comparison of segmented graphics revealed significant differences')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011009', 'A', '05011009', 'The group alignment does not include the current alignment point', 'The group alignment does not include the current alignment point')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0501100A', 'A', '0501100A', 'The alignment point exceeds the current area', 'The alignment point exceeds the current area')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0501100B', 'A', '0501100B', 'Split alignment graphics analysis exception', 'Split alignment graphics analysis exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0501100C', 'A', '0501100C', 'Dry film template not found', 'Dry film template not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0501100D', 'A', '0501100D', 'Gdsii parsing exception', 'Gdsii parsing exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0501100E', 'A', '0501100E', 'Layer parsing failed', 'Layer parsing failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011010', 'A', '05011010', 'odb++ Job name XMIRROR is not equal to 0', 'odb++ Job name XMIRROR is not equal to 0')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011011', 'A', '05011011', 'Invalid Job name, wrong layer selection', 'Invalid Job name, wrong layer selection')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011012', 'A', '05011012', 'The number of points is zero', 'The number of points is zero')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011013', 'A', '05011013', 'The number of marks is less than 3', 'The number of marks is less than 3')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011014', 'A', '05011014', 'Abnormal lens segmentation graphics', 'Abnormal lens segmentation graphics')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011015', 'A', '05011015', 'Segmentation shape file not found', 'Segmentation shape file not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011016', 'A', '05011016', 'Bsa alignment layer is not B side', 'Bsa alignment layer is not B side')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011017', 'A', '05011017', 'Bsa alignment template does not set the A side', 'Bsa alignment template does not set the A side')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011018', 'A', '05011018', 'Odbpp parsed object is empty', 'Odbpp parsed object is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05011019', 'A', '05011019', 'The Job name graphic cutting source layer name is empty', 'The Job name graphic cutting source layer name is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0501101A', 'A', '0501101A', 'Type or interface not implemented', 'Type or interface not implemented')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0501101B', 'A', '0501101B', 'Mvf graphics comparison abnormal', 'Mvf graphics comparison abnormal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05020001', 'W', '05020001', 'Loading Job name abnormality', 'Loading Job name abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05020002', 'W', '05020002', 'ReStartJobProc', 'ReStartJobProc')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05020003', 'W', '05020003', 'Abnormal reminder of Job name deletion', 'Abnormal reminder of Job name deletion')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05021001', 'A', '05021001', 'Disconnection', 'Disconnection')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05021002', 'A', '05021002', 'Problems occurred when copying files from the secondary workstation to the primary workstation', 'Problems occurred when copying files from the secondary workstation to the primary workstation')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05021003', 'A', '05021003', 'Auxiliary workstation Job name service abnormality', 'Auxiliary workstation Job name service abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05021004', 'A', '05021004', 'The specified Job name does not exist', 'The specified Job name does not exist')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05021005', 'A', '05021005', 'The specified layer information does not exist', 'The specified layer information does not exist')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05021006', 'A', '05021006', 'Job name forced deletion exception', 'Job name forced deletion exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05021007', 'A', '05021007', 'Exposure software not running', 'Exposure software not running')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05021008', 'A', '05021008', 'Gdsii Job name file not found', 'Gdsii Job name file not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05021009', 'A', '05021009', 'No odb++ Job name compressed file found', 'No odb++ Job name compressed file found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0502100A', 'A', '0502100A', 'The center of the Cam and Profile do not coincide', 'The center of the Cam and Profile do not coincide')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0502100B', 'A', '0502100B', 'The number of rule mark points does not match the actual number', 'The number of rule mark points does not match the actual number')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0502100C', 'A', '0502100C', 'Rule not implemented', 'Rule not implemented')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0502100D', 'A', '0502100D', 'Abnormal saving of text macro settings', 'Abnormal saving of text macro settings')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0502100E', 'A', '0502100E', 'Abnormal copying of files from the primary workstation to the secondary workstation', 'Abnormal copying of files from the primary workstation to the secondary workstation')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05031001', 'A', '05031001', 'User already exists', 'User already exists')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05031002', 'A', '05031002', 'Error in changing password', 'Error in changing password')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05031003', 'A', '05031003', 'Modify role error', 'Modify role error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('05031004', 'A', '05031004', 'Login Error', 'Login Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('06010001', 'A', '06010001', 'Unable to find the Region where the Mark is located', 'Unable to find the Region where the Mark is located')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('06010002', 'A', '06010002', 'There is no alignment group, and the cam outer rectangle cannot be calculated.', 'There is no alignment group, and the cam outer rectangle cannot be calculated.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('06010003', 'W', '06010003', 'Unknown linear fitting algorithm type', 'Unknown linear fitting algorithm type')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('06010004', 'W', '06010004', 'The srcPts collection is empty', 'The srcPts collection is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('06010005', 'W', '06010005', 'The dstPts collection is empty', 'The dstPts collection is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('06010006', 'W', '06010006', 'The initial value of the iteration is empty', 'The initial value of the iteration is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('06010007', 'W', '06010007', 'Iteration error threshold is empty', 'Iteration error threshold is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('06010008', 'A', '06010008', 'Incorrect number of input points during least squares fitting', 'Incorrect number of input points during least squares fitting')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('06010009', 'A', '06010009', 'PR8D result calculation error', 'PR8D result calculation error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0601000A', 'A', '0601000A', 'Insufficient number of sites', 'Insufficient number of sites')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0601000B', 'A', '0601000B', 'The scale measured in the X direction exceeds the preset grouping range', 'The scale measured in the X direction exceeds the preset grouping range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0601000C', 'A', '0601000C', 'The scale measured in the Y direction exceeds the preset grouping range', 'The scale measured in the Y direction exceeds the preset grouping range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0601000D', 'A', '0601000D', 'The preset group of segment scale is empty', 'The preset group of segment scale is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0601000E', 'A', '0601000E', 'BSA association layer not found', 'BSA association layer not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('06020001', 'A', '06020001', 'LensOverlap cannot be negative', 'LensOverlap cannot be negative')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010001', 'W', '0A010001', 'Mes sends automatic job error', 'Mes sends automatic job error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010002', 'W', '0A010002', 'Mes sending scan code to create jobs error', 'Mes sending scan code to create jobs error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010003', 'W', '0A010003', 'Mes issuing process sheet error', 'Mes issuing process sheet error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010004', 'W', '0A010004', 'Mes automatic task delivery error', 'Mes automatic task delivery error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010005', 'W', '0A010005', 'Mes sending task by scanning QR code error', 'Mes sending task by scanning QR code error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010006', 'W', '0A010006', 'Mes heartbeat polling error', 'Mes heartbeat polling error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010007', 'W', '0A010007', 'Mes data initialization error', 'Mes data initialization error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010008', 'W', '0A010008', 'Mes system time verification error', 'Mes system time verification error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010009', 'W', '0A010009', 'Mes control mode error', 'Mes control mode error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01000A', 'W', '0A01000A', 'Mes remote prompt message sending error', 'Mes remote prompt message sending error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01000B', 'W', '0A01000B', 'Mes sending remote control command error', 'Mes sending remote control command error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01000C', 'W', '0A01000C', 'Mes mission information update error', 'Mes mission information update error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01000D', 'W', '0A01000D', 'Mes machine recipe parameter access error', 'Mes machine recipe parameter access error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01000E', 'W', '0A01000E', 'Mes machine current production status access error', 'Mes machine current production status access error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01000F', 'W', '0A01000F', 'Mes machine status upload error', 'Mes machine status upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010010', 'W', '0A010010', 'Mes alarm information upload error', 'Mes alarm information upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010011', 'W', '0A010011', 'Mes process parameter upload error', 'Mes process parameter upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010012', 'W', '0A010012', 'Mes control mode upload error', 'Mes control mode upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010013', 'W', '0A010013', 'Mes device''s current operating mode upload error', 'Mes device''s current operating mode upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010014', 'W', '0A010014', 'Mes device''s current system time upload error', 'Mes device''s current system time upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010015', 'W', '0A010015', 'Mes device''s current uses recipe upload error', 'Mes device''s current uses recipe upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010016', 'W', '0A010016', 'Mes upload error', 'Mes upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010017', 'W', '0A010017', 'Mes upload board information upload error', 'Mes upload board information upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010018', 'W', '0A010018', 'Mes lower board information upload error', 'Mes lower board information upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010019', 'W', '0A010019', 'Mes board reading information upload error', 'Mes board reading information upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01001A', 'W', '0A01001A', 'Mes abnormal board information upload error', 'Mes abnormal board information upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01001B', 'W', '0A01001B', 'Mes machine parameter modification upload error', 'Mes machine parameter modification upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01001C', 'W', '0A01001C', 'Mes Job name information modification upload error', 'Mes Job name information modification upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01001D', 'A', '0A01001D', 'Mess Job name information modification upload error', 'Mess Job name information modification upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01001E', 'W', '0A01001E', 'Mes data has serialization errors', 'Mes data has serialization errors')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01001F', 'W', '0A01001F', 'Mes data has deserialization error', 'Mes data has deserialization error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010020', 'A', '0A010020', 'Mes project service startup error', 'Mes project service startup error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010021', 'W', '0A010021', 'Mes batch deletion error', 'Mes batch deletion error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010022', 'W', '0A010022', 'Mes batch addition error', 'Mes batch addition error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010023', 'W', '0A010023', 'Mes batch update error', 'Mes batch update error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010024', 'W', '0A010024', 'Mes Job name deletion error', 'Mes Job name deletion error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010025', 'W', '0A010025', 'Mes Job name addition error', 'Mes Job name addition error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010026', 'W', '0A010026', 'Mes Job name update error', 'Mes Job name update error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010027', 'W', '0A010027', 'Mes Job name scheduled deletion error', 'Mes Job name scheduled deletion error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010028', 'W', '0A010028', 'Mes batch scheduled deletion error', 'Mes batch scheduled deletion error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010029', 'W', '0A010029', 'Mes scheduled deletion of zip files error', 'Mes scheduled deletion of zip files error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01002A', 'W', '0A01002A', 'Mes batch query error', 'Mes batch query error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01002B', 'W', '0A01002B', 'Mes Job name query error', 'Mes Job name query error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01002C', 'W', '0A01002C', 'Mes batch check error', 'Mes batch check error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01002D', 'W', '0A01002D', 'Mes Job name check error', 'Mes Job name check error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01002E', 'A', '0A01002E', 'Failed to enable restful', 'Failed to enable restful')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A01002F', 'A', '0A01002F', 'Failed to start monitoring ccd service', 'Failed to start monitoring ccd service')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010030', 'A', '0A010030', 'acceptCallback failed', 'acceptCallback failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010031', 'A', '0A010031', 'ListenSocket BeginAccept Error', 'ListenSocket BeginAccept Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010032', 'A', '0A010032', 'Failed to receive CCD information', 'Failed to receive CCD information')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010033', 'W', '0A010033', 'Mes notification Job name processing result is abnormal', 'Mes notification Job name processing result is abnormal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010034', 'A', '0A010034', 'Mes WebService is running abnormally', 'Mes WebService is running abnormally')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010035', 'A', '0A010035', 'Mes recipe update error', 'Mes recipe update error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010036', 'W', '0A010036', 'Mes recipe timed deletion error', 'Mes recipe timed deletion error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010037', 'A', '0A010037', 'Mes processing parameter upload error', 'Mes processing parameter upload error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010038', 'A', '0A010038', 'Mes recipe delivery error', 'Mes recipe delivery error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010039', 'A', '0A010039', 'Mes recipe status query error', 'Mes recipe status query error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A010040', 'W', '0A010040', 'Mes Job name parameter error', 'Mes Job name parameter error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A020001', 'A', '0A020001', 'machine update batch task error', 'machine update batch task error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A020002', 'A', '0A020002', 'CCD barcode scanning camera abnormality', 'CCD barcode scanning camera abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A020003', 'A', '0A020003', 'CCD barcode scanning camera data processing abnormality', 'CCD barcode scanning camera data processing abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0A020004', 'W', '0A020004', 'Batch task switching failed', 'Batch task switching failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B040001', 'A', '0B040001', 'No Job name has been imported', 'No Job name has been imported')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B040002', 'A', '0B040002', 'Calibration failed and exposure is not allowed', 'Calibration failed and exposure is not allowed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B040003', 'A', '0B040003', 'Wrong print mode selection', 'Wrong print mode selection')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B040004', 'A', '0B040004', 'Water temperature exceeds standard', 'Water temperature exceeds standard')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B040005', 'A', '0B040005', 'Cancel alignment', 'Cancel alignment')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B060001', 'A', '0B060001', 'The calibration result is empty', 'The calibration result is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070001', 'W', '0B070001', 'Reselect MARK', 'Reselect MARK')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070002', 'W', '0B070002', 'Setting ruler 2 IO failed', 'Setting ruler 2 IO failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070003', 'W', '0B070003', 'BSA calibration result is empty', 'BSA calibration result is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070004', 'W', '0B070004', 'Failed to close the door', 'Failed to close the door')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070005', 'W', '0B070005', 'Failed to open the door', 'Failed to open the door')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070006', 'W', '0B070006', 'The current position does not allow the action plate', 'The current position does not allow the action plate')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070007', 'W', '0B070007', 'Release plate operation abnormal!!!', 'Release plate operation abnormal!!!')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070008', 'W', '0B070008', 'Fitting is only applicable to circular targets and circle + ring array targets', 'Fitting is only applicable to circular targets and circle + ring array targets')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070009', 'W', '0B070009', 'Automatic line not configured', 'Automatic line not configured')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B07000A', 'W', '0B07000A', 'Automatic download OK board timeout', 'Automatic download OK board timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B07000B', 'W', '0B07000B', 'Abnormal board preparation on automatic line', 'Abnormal board preparation on automatic line')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B07000C', 'W', '0B07000C', 'The waiting time for automatic download board preparation is too long', 'The waiting time for automatic download board preparation is too long')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B07000D', 'W', '0B07000D', 'Automatic download NG board timeout', 'Automatic download NG board timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B07000E', 'W', '0B07000E', 'Automatic download OK board result is abnormal', 'Automatic download OK board result is abnormal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B07000F', 'W', '0B07000F', 'Abnormal result of automatic offline board preparation', 'Abnormal result of automatic offline board preparation')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070010', 'W', '0B070010', 'Abnormal automatic offline NG results', 'Abnormal automatic offline NG results')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070011', 'W', '0B070011', 'Add element using parameter input window is empty', 'Add element using parameter input window is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070012', 'W', '0B070012', 'Parameter addition error', 'Parameter addition error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070013', 'W', '0B070013', 'Parameter input window save error', 'Parameter input window save error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070014', 'W', '0B070014', 'Error when canceling the parameter input window', 'Error when canceling the parameter input window')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070015', 'W', '0B070015', 'Unable to find Job name', 'Unable to find Job name')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070016', 'W', '0B070016', 'The sizes of the upstream and downstream boards are inconsistent', 'The sizes of the upstream and downstream boards are inconsistent')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0B070017', 'W', '0B070017', 'Another one is printing', 'Another one is printing')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C010001', 'A', '0C010001', 'Double table collision error', 'Double table collision error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C010002', 'A', '0C010002', 'Cancel Printing', 'Cancel Printing')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C010003', 'A', '0C010003', 'Waiting for scan timeout', 'Waiting for scan timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C010004', 'A', '0C010004', 'Scan quantity error', 'Scan quantity error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C010005', 'A', '0C010005', 'Abnormal exposure, please check', 'Abnormal exposure, please check')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020001', 'A', '0C020001', 'Automatic line component not configured', 'Automatic line component not configured')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020002', 'A', '0C020002', 'Waiting for automatic down load board error', 'Waiting for automatic down load board error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020003', 'A', '0C020003', 'waiting for the automatic line to be ready error', 'waiting for the automatic line to be ready error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020004', 'A', '0C020004', 'Waiting for the automatic down load OK board error', 'Waiting for the automatic down load OK board error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020005', 'A', '0C020005', 'Waiting for automatic down load NG board error', 'Waiting for automatic down load NG board error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020006', 'A', '0C020006', 'Please check the automatic print style configuration', 'Please check the automatic print style configuration')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020007', 'A', '0C020007', 'The current automatic line object is empty, program logic error', 'The current automatic line object is empty, program logic error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020008', 'A', '0C020008', 'Get the current batch number', 'Get the current batch number')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020009', 'A', '0C020009', 'The production queue is empty or all production has been completed', 'The production queue is empty or all production has been completed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C02000A', 'A', '0C02000A', 'Received a print stop command', 'Received a print stop command')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C02000B', 'A', '0C02000B', 'Automatic line not configured', 'Automatic line not configured')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C02000C', 'A', '0C02000C', 'Unsupported print mode', 'Unsupported print mode')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C02000D', 'A', '0C02000D', 'Stop Printing', 'Stop Printing')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C02000E', 'W', '0C02000E', 'Automatic line measurement scale error', 'Automatic line measurement scale error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C02000F', 'W', '0C02000F', 'Verify the allowed quantity error', 'Verify the allowed quantity error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020010', 'A', '0C020010', 'Print layer is empty', 'Print layer is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020011', 'A', '0C020011', 'Detection table with board error', 'Detection table with board error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020012', 'A', '0C020012', 'There is no board in the code reading queue.', 'There is no board in the code reading queue.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020013', 'A', '0C020013', 'Setting quantity error', 'Setting quantity error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020014', 'A', '0C020014', 'Safety sensor triggered', 'Safety sensor triggered')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020015', 'A', '0C020015', 'Automatic line instruction abnormality', 'Automatic line instruction abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020016', 'A', '0C020016', 'There is no QR code in the current board information', 'There is no QR code in the current board information')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020017', 'W', '0C020017', 'Detecting vacuum anomalies', 'Detecting vacuum anomalies')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C020018', 'A', '0C020018', 'Stop Printing', 'Stop Printing')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C040001', 'A', '0C040001', 'Not set as base camera', 'Not set as base camera')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C040002', 'A', '0C040002', 'The camera exposure time is set incorrectly', 'The camera exposure time is set incorrectly')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C040003', 'A', '0C040003', 'Dobsa', 'Dobsa')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C040004', 'W', '0C040004', 'The number of valid marks is too small', 'The number of valid marks is too small')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C040005', 'W', '0C040005', 'DoBSAB', 'DoBSAB')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C040006', 'W', '0C040006', 'Split Counterpoint', 'Split Counterpoint')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C040007', 'W', '0C040007', 'BuildOutput', 'BuildOutput')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C040008', 'W', '0C040008', 'Motor moving camera name is empty error', 'Motor moving camera name is empty error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C040009', 'W', '0C040009', 'Check mark extraction', 'Check mark extraction')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C04000A', 'W', '0C04000A', 'Single Extraction', 'Single Extraction')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C04000B', 'W', '0C04000B', 'Unable to distinguish the correct alignment point', 'Unable to distinguish the correct alignment point')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C04000C', 'W', '0C04000C', 'Matching error', 'Matching error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C04000D', 'W', '0C04000D', 'Checking local templates', 'Checking local templates')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C04000E', 'W', '0C04000E', 'checking matching template error', 'checking matching template error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C04000F', 'W', '0C04000F', 'Turn on the light  error', 'Turn on the light  error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C040010', 'W', '0C040010', 'Wrong alignment mode selection', 'Wrong alignment mode selection')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050001', 'A', '0C050001', 'Temperature detection abnormality', 'Temperature detection abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050002', 'A', '0C050002', 'Scale compensation x-axis mapping abnormality', 'Scale compensation x-axis mapping abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050003', 'A', '0C050003', 'Calibrate the abnormal angle between CCD and stage', 'Calibrate the abnormal angle between CCD and stage')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050004', 'A', '0C050004', 'The position relationship between the calibration CCD is abnormal', 'The position relationship between the calibration CCD is abnormal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050005', 'A', '0C050005', 'The position relationship between the calibration lenses is abnormal', 'The position relationship between the calibration lenses is abnormal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050006', 'A', '0C050006', 'Abnormal positional relationship between BSA', 'Abnormal positional relationship between BSA')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050007', 'A', '0C050007', 'Lens energy detection failed', 'Lens energy detection failed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050008', 'W', '0C050008', 'Abnormal calibration lens energy', 'Abnormal calibration lens energy')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050009', 'W', '0C050009', 'The number of BsaMarks filtered out in the plate range is too small', 'The number of BsaMarks filtered out in the plate range is too small')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05000A', 'W', '0C05000A', 'The number of BsaMarks finally selected', 'The number of BsaMarks finally selected')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05000B', 'W', '0C05000B', 'Error in getting Bsa template', 'Error in getting Bsa template')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05000C', 'W', '0C05000C', 'No corresponding template found', 'No corresponding template found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05000D', 'W', '0C05000D', 'Automatically select BSAMark, the A side set is empty', 'Automatically select BSAMark, the A side set is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05000E', 'W', '0C05000E', 'Automatically select BSAMark, quantity is empty', 'Automatically select BSAMark, quantity is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05000F', 'W', '0C05000F', 'Error in getting BsaMark', 'Error in getting BsaMark')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050010', 'W', '0C050010', 'bsamark does not enable autoselect and the bsa template name is empty', 'bsamark does not enable autoselect and the bsa template name is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050011', 'W', '0C050011', 'Failed to find the corresponding laser channel number configured in the hardware', 'Failed to find the corresponding laser channel number configured in the hardware')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050012', 'W', '0C050012', 'Bsa burning error', 'Bsa burning error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050013', 'W', '0C050013', 'There is no BsaMarks information in the part number', 'There is no BsaMarks information in the part number')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050014', 'W', '0C050014', 'cell is 0', 'cell is 0')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050015', 'W', '0C050015', 'Initialize no corresponding cell', 'Initialize no corresponding cell')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050016', 'W', '0C050016', 'The mark point exceeds the board width and cannot be positioned', 'The mark point exceeds the board width and cannot be positioned')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050017', 'W', '0C050017', 'Two adjacent job names cannot be the same', 'Two adjacent job names cannot be the same')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050018', 'W', '0C050018', 'The mvf file does not exist', 'The mvf file does not exist')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050019', 'W', '0C050019', 'Compare MD5 values ​​of Mvf files', 'Compare MD5 values ​​of Mvf files')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05001A', 'W', '0C05001A', 'Failed to start the send data module', 'Failed to start the send data module')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05001B', 'W', '0C05001B', 'Warden error', 'Warden error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05001C', 'W', '0C05001C', 'Because other warden servers have errors', 'Because other warden servers have errors')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05001D', 'W', '0C05001D', 'Check the strip and find abnormalities', 'Check the strip and find abnormalities')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05001E', 'W', '0C05001E', 'An exception occurs when stopping RIP', 'An exception occurs when stopping RIP')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05001F', 'W', '0C05001F', 'Abnormal strip width', 'Abnormal strip width')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050020', 'W', '0C050020', 'Please make sure that the AB side is not empty', 'Please make sure that the AB side is not empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050021', 'W', '0C050021', 'IOBoard is empty', 'IOBoard is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050022', 'W', '0C050022', 'Water cooler error', 'Water cooler error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050023', 'W', '0C050023', 'Boot error', 'Boot error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050024', 'W', '0C050024', 'Frost sensor abnormality', 'Frost sensor abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050025', 'W', '0C050025', 'Air conditioning not configured', 'Air conditioning not configured')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050026', 'W', '0C050026', 'Air conditioning abnormality', 'Air conditioning abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050027', 'W', '0C050027', 'Water cooler abnormality', 'Water cooler abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050028', 'W', '0C050028', 'Automatic line is empty', 'Automatic line is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050029', 'W', '0C050029', 'Automatic line is not in safe position', 'Automatic line is not in safe position')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05002A', 'W', '0C05002A', 'Release board operation abnormality', 'Release board operation abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05002B', 'W', '0C05002B', 'Unknown measurement mode', 'Unknown measurement mode')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05002C', 'W', '0C05002C', 'Measurement stop', 'Measurement stop')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05002D', 'W', '0C05002D', 'scale measurement only supports global alignment mode', 'scale measurement only supports global alignment mode')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05002E', 'A', '0C05002E', 'No layer information', 'No layer information')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05002F', 'A', '0C05002F', 'Move click error', 'Move click error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050030', 'W', '0C050030', 'Cancel scale measurement', 'Cancel scale measurement')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050031', 'W', '0C050031', 'Energy controller is not the latest', 'Energy controller is not the latest')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050032', 'A', '0C050032', 'Energy coefficient not configured', 'Energy coefficient not configured')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050033', 'A', '0C050033', 'Multiband ratio setting error', 'Multiband ratio setting error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050034', 'A', '0C050034', 'Please do not select left and right rendition for outer Job name', 'Please do not select left and right rendition for outer Job name')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050035', 'A', '0C050035', 'The scale system in the formula does not meet the standards', 'The scale system in the formula does not meet the standards')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050036', 'A', '0C050036', 'Warden is empty', 'Warden is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050037', 'A', '0C050037', 'Sync board is empty', 'Sync board is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050038', 'A', '0C050038', 'Laser accelerator board is empty', 'Laser accelerator board is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050039', 'A', '0C050039', 'Exposure position setting error', 'Exposure position setting error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05003A', 'A', '0C05003A', 'The current synchronization count deviation is still too large', 'The current synchronization count deviation is still too large')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05003B', 'A', '0C05003B', 'Y-axis movement timeout', 'Y-axis movement timeout')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05003C', 'A', '0C05003C', 'DGB is inconsistent with theory', 'DGB is inconsistent with theory')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05003D', 'A', '0C05003D', 'PE setup error', 'PE setup error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05003E', 'A', '0C05003E', 'PE over limit', 'PE over limit')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05003F', 'A', '0C05003F', 'JE over limit', 'JE over limit')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050040', 'A', '0C050040', 'Scale exceed', 'Scale exceed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050041', 'A', '0C050041', 'Batch printing completed error', 'Batch printing completed error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050042', 'A', '0C050042', 'The current board information does not contain a QR code', 'The current board information does not contain a QR code')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050043', 'A', '0C050043', 'The length of the QR code currently received is inconsistent with the set length', 'The length of the QR code currently received is inconsistent with the set length')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050044', 'A', '0C050044', 'Error getting DMD position', 'Error getting DMD position')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050045', 'A', '0C050045', 'The scale of the AB side are inconsistent', 'The scale of the AB side are inconsistent')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050046', 'A', '0C050046', 'Wrong number of stripes', 'Wrong number of stripes')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050047', 'A', '0C050047', 'Counting Error', 'Counting Error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050048', 'A', '0C050048', 'Initialization context error', 'Initialization context error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050049', 'A', '0C050049', 'Automatic line is not in safe position', 'Automatic line is not in safe position')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05004A', 'A', '0C05004A', 'The required displacement sensor could not be found', 'The required displacement sensor could not be found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05004B', 'A', '0C05004B', 'Abnormal Z-axis movement position', 'Abnormal Z-axis movement position')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05004C', 'A', '0C05004C', 'Error moving to exposure focus plane', 'Error moving to exposure focus plane')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05004D', 'A', '0C05004D', 'The scale measurement is not completed', 'The scale measurement is not completed')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05004E', 'A', '0C05004E', 'Stage Y is too far from the upper plate position', 'Stage Y is too far from the upper plate position')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05004F', 'A', '0C05004F', 'No board on the stage', 'No board on the stage')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050050', 'A', '0C050050', 'Door opening abnormality', 'Door opening abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050051', 'A', '0C050051', 'Safety light curtain trigger', 'Safety light curtain trigger')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050052', 'A', '0C050052', 'Abnormal closing of door', 'Abnormal closing of door')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050053', 'A', '0C050053', 'Abnormal status of the pressure plate cylinder', 'Abnormal status of the pressure plate cylinder')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050054', 'A', '0C050054', 'Stage Y-axis safety sensor trigger', 'Stage Y-axis safety sensor trigger')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050055', 'A', '0C050055', 'Stage Z-axis safety sensor trigger', 'Stage Z-axis safety sensor trigger')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050056', 'A', '0C050056', 'Safety sensor triggering', 'Safety sensor triggering')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050057', 'A', '0C050057', 'The number of cells is 0', 'The number of cells is 0')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050058', 'A', '0C050058', 'The alignment point is larger than the board width and cannot be aligned', 'The alignment point is larger than the board width and cannot be aligned')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050059', 'A', '0C050059', 'The ART test process path does not exist', 'The ART test process path does not exist')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05005A', 'A', '0C05005A', 'Unable to find debug directory', 'Unable to find debug directory')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05005B', 'A', '0C05005B', 'BsaMark number configuration error', 'BsaMark number configuration error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05005C', 'A', '0C05005C', 'Camera is empty', 'Camera is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05005D', 'A', '0C05005D', 'The BSA position relationship has changed significantly', 'The BSA position relationship has changed significantly')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05005E', 'A', '0C05005E', 'Whether the XY compensation value exceeds the threshold', 'Whether the XY compensation value exceeds the threshold')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05005F', 'A', '0C05005F', 'Whether the X compensation value exceeds the threshold', 'Whether the X compensation value exceeds the threshold')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050060', 'A', '0C050060', 'Measurement series is empty', 'Measurement series is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050061', 'A', '0C050061', 'The camera position calibration result exceeds the threshold alarm value', 'The camera position calibration result exceeds the threshold alarm value')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050062', 'A', '0C050062', 'The X-direction repeatability data exceeds the alarm threshold', 'The X-direction repeatability data exceeds the alarm threshold')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050063', 'A', '0C050063', 'The Y-direction repeatability data exceeds the alarm threshold', 'The Y-direction repeatability data exceeds the alarm threshold')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050064', 'A', '0C050064', 'The center coordinates of the two tests are very different', 'The center coordinates of the two tests are very different')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050065', 'A', '0C050065', 'DGB temperature detection abnormality', 'DGB temperature detection abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050066', 'W', '0C050066', 'Graphics path not found', 'Graphics path not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050067', 'W', '0C050067', 'Image format error', 'Image format error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050068', 'W', '0C050068', 'Check door status abnormality', 'Check door status abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050069', 'W', '0C050069', 'Laser energy detection tool calibration abnormality', 'Laser energy detection tool calibration abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05006A', 'W', '0C05006A', 'Big differences between lenses', 'Big differences between lenses')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05006B', 'W', '0C05006B', 'Band not in range', 'Band not in range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05006C', 'W', '0C05006C', 'An abnormality occurred when loading the Job name', 'An abnormality occurred when loading the Job name')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05006D', 'W', '0C05006D', 'The axis step length cannot be less than 0', 'The axis step length cannot be less than 0')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05006E', 'W', '0C05006E', 'The axis step length cannot be less than 0', 'The axis step length cannot be less than 0')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05006F', 'W', '0C05006F', 'Abnormal calibration results', 'Abnormal calibration results')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050070', 'W', '0C050070', 'Energy sensor is out of range', 'Energy sensor is out of range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050071', 'W', '0C050071', 'The calibration lens spacing exceeds the abnormality', 'The calibration lens spacing exceeds the abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050072', 'W', '0C050072', 'Wrong number of lasers', 'Wrong number of lasers')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050073', 'W', '0C050073', 'Measurement quantity collection error', 'Measurement quantity collection error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050074', 'W', '0C050074', 'Error in parsing the X-axis mapping data', 'Error in parsing the X-axis mapping data')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050075', 'A', '0C050075', 'IO exception', 'IO exception')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050076', 'A', '0C050076', 'Axis name error', 'Axis name error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050077', 'A', '0C050077', 'Motor control parameter abnormality', 'Motor control parameter abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050078', 'W', '0C050078', 'Extraction quantity is too small', 'Extraction quantity is too small')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050079', 'A', '0C050079', 'Too many extractions', 'Too many extractions')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05007A', 'A', '0C05007A', 'Extraction point abnormality', 'Extraction point abnormality')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05007B', 'W', '0C05007B', 'The circular array center data format is incorrect.', 'The circular array center data format is incorrect.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05007C', 'W', '0C05007C', 'The pressure plate is not opened and cannot be moved', 'The pressure plate is not opened and cannot be moved')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05007D', 'W', '0C05007D', 'The compensation value data exceeds the alarm threshold', 'The compensation value data exceeds the alarm threshold')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05007E', 'W', '0C05007E', 'Error in parsing the mapping data for the A1 axis', 'Error in parsing the mapping data for the A1 axis')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05007F', 'W', '0C05007F', 'The matrix has incorrect dimensions and cannot be added.', 'The matrix has incorrect dimensions and cannot be added.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050080', 'W', '0C050080', 'Motor start position error', 'Motor start position error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050081', 'W', '0C050081', 'Angle data exceeds the alarm threshold', 'Angle data exceeds the alarm threshold')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050082', 'W', '0C050082', 'Error in parsing the X-axis mapping data', 'Error in parsing the X-axis mapping data')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050083', 'W', '0C050083', 'The matrix dimensions are incorrect and cannot be subtracted.', 'The matrix dimensions are incorrect and cannot be subtracted.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050084', 'W', '0C050084', 'Two matrices cannot be merged if the number of columns is not equal', 'Two matrices cannot be merged if the number of columns is not equal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050085', 'W', '0C050085', 'The accuracy data of the axis exceeds the alarm threshold', 'The accuracy data of the axis exceeds the alarm threshold')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050086', 'W', '0C050086', 'Abnormal results of automatic upload board preparation', 'Abnormal results of automatic upload board preparation')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050087', 'W', '0C050087', 'Automatic down OK board result is abnormal', 'Automatic down OK board result is abnormal')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050088', 'W', '0C050088', 'The camera is not calibrated.', 'The camera is not calibrated.')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050089', 'W', '0C050089', 'The camera axis position cannot be less than zero', 'The camera axis position cannot be less than zero')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05008A', 'W', '0C05008A', 'Unable to calibrate the lens', 'Unable to calibrate the lens')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05008B', 'W', '0C05008B', 'The relationship between the camera and the stage is not calibrated', 'The relationship between the camera and the stage is not calibrated')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05008C', 'W', '0C05008C', 'Energy table file not found', 'Energy table file not found')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05008D', 'W', '0C05008D', 'The current energy value is too small', 'The current energy value is too small')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05008E', 'W', '0C05008E', 'The current energy value used is too large', 'The current energy value used is too large')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C05008F', 'W', '0C05008F', 'Energy meter driver does not exist', 'Energy meter driver does not exist')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050090', 'W', '0C050090', 'Failed to obtain energy records', 'Failed to obtain energy records')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050091', 'W', '0C050091', 'Unable to find the corresponding lens mode', 'Unable to find the corresponding lens mode')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050092', 'W', '0C050092', 'Print information is empty', 'Print information is empty')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050093', 'W', '0C050093', 'Exposure out of range', 'Exposure out of range')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050094', 'W', '0C050094', 'PE exceeds the limit and automatically turns off NG', 'PE exceeds the limit and automatically turns off NG')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050095', 'W', '0C050095', 'Mixed models automatically NG', 'Mixed models automatically NG')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050096', 'W', '0C050096', 'machine configuration error', 'machine configuration error')
    ON CONFLICT (alarm_id) DO NOTHING;"
"INSERT INTO public.ldi_alarm_ms_code
    (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
    VALUES ('0C050097', 'W', '0C050097', 'Illegal opening of security door', 'Illegal opening of security door')
    ON CONFLICT (alarm_id) DO NOTHING;"
