import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  CardActions,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Search as SearchIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';
import axios from 'axios';

interface StorageSummary {
  totalUsed: number;
  totalAvailable: number;
  totalLimit: number;
  connectedServices: number;
}

const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<StorageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/storage/stats');
      const stats = response.data.stats;

      const summary: StorageSummary = {
        totalUsed: stats.reduce((acc: number, curr: any) => acc + curr.used, 0),
        totalAvailable: stats.reduce((acc: number, curr: any) => acc + curr.available, 0),
        totalLimit: stats.reduce((acc: number, curr: any) => acc + curr.limit, 0),
        connectedServices: stats.length,
      };

      setSummary(summary);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch storage summary');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {summary && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Storage Overview
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body1">
                  Total Storage Used: {formatBytes(summary.totalUsed)}
                </Typography>
                <Typography variant="body1">
                  Total Available: {formatBytes(summary.totalAvailable)}
                </Typography>
                <Typography variant="body1">
                  Total Storage Limit: {formatBytes(summary.totalLimit)}
                </Typography>
                <Typography variant="body1">
                  Connected Services: {summary.connectedServices}
                </Typography>
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Grid container spacing={2} sx={{ mt: 2 }}>
                <Grid item xs={12} sm={4}>
                  <Card>
                    <CardContent>
                      <UploadIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                      <Typography variant="h6">Upload</Typography>
                    </CardContent>
                    <CardActions>
                      <Button
                        fullWidth
                        variant="contained"
                        onClick={() => navigate('/files')}
                      >
                        Upload Files
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Card>
                    <CardContent>
                      <SearchIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                      <Typography variant="h6">Search</Typography>
                    </CardContent>
                    <CardActions>
                      <Button
                        fullWidth
                        variant="contained"
                        onClick={() => navigate('/files')}
                      >
                        Search Files
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Card>
                    <CardContent>
                      <StorageIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                      <Typography variant="h6">Storage</Typography>
                    </CardContent>
                    <CardActions>
                      <Button
                        fullWidth
                        variant="contained"
                        onClick={() => navigate('/stats')}
                      >
                        View Stats
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default Dashboard; 